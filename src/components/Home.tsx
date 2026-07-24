/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import type EditorJS from "@editorjs/editorjs";
import { motion } from "framer-motion";
import { CheckCircle2, Link2, Plus, Send, Trash2, Unplug, Upload } from "lucide-react";
import Papa from "papaparse";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Recipient { name: string; email: string }
type Provider = "google" | "microsoft" | "zoho" | "custom";
interface Account { id: string; provider: Exclude<Provider, "custom">; email: string; displayName?: string }

const providerLabels: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  zoho: "Zoho",
  custom: "بريد مخصص",
};

export default function EmailCampaignTool() {
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: "", email: "" }]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<Provider>("google");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [activeTab, setActiveTab] = useState("compose");
  const [useGreeting, setUseGreeting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [persistentStoreConfigured, setPersistentStoreConfigured] = useState(true);
  const [customSmtp, setCustomSmtp] = useState({ host: "", port: "587", secure: false, username: "", password: "" });
  const editorRef = useRef<EditorJS | null>(null);

  const loadAccounts = async () => {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    const data = await response.json();
    setAccounts(data.accounts || []);
    setPersistentStoreConfigured(Boolean(data.persistentStoreConfigured));
  };

  useEffect(() => {
    loadAccounts().catch(() => toast.error("تعذر تحميل الحسابات المربوطة"));
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauth_error");
    if (connected) toast.success(`تم ربط ${providerLabels[connected as Provider]} بنجاح`);
    if (oauthError) toast.error(oauthError);
    if (connected || oauthError) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const matching = accounts.filter((item) => item.provider === provider);
    if (provider !== "custom" && !matching.some((item) => item.id === accountId)) setAccountId(matching[0]?.id || "");
  }, [provider, accounts, accountId]);

  const initializeEditor = async () => {
    if (editorRef.current) return;
    const EditorJSClass = (await import("@editorjs/editorjs")).default;
    const Header = (await import("@editorjs/header")).default;
    const List = (await import("@editorjs/list")).default;
    const Checklist = (await import("@editorjs/checklist")).default;
    const Quote = (await import("@editorjs/quote")).default;
    const CodeTool = (await import("@editorjs/code")).default;
    const InlineCode = (await import("@editorjs/inline-code")).default;
    const Marker = (await import("@editorjs/marker")).default;
    const Underline = (await import("@editorjs/underline")).default;
    const ImageTool = (await import("@editorjs/image")).default;
    const editor = new EditorJSClass({
      holder: "editorjs",
      autofocus: false,
      tools: {
        header: Header, list: List, checklist: Checklist, quote: Quote, code: CodeTool,
        inlineCode: InlineCode, marker: Marker, underline: Underline,
        image: {
          class: ImageTool,
          config: { uploader: { uploadByFile: (file: File) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve({ success: 1, file: { url: event.target?.result } });
            reader.readAsDataURL(file);
          }) } },
        },
      },
      onChange: async () => setText(JSON.stringify(await editor.save())),
    });
    editorRef.current = editor;
  };

  useEffect(() => {
    if (activeTab === "compose") initializeEditor();
    return () => undefined;
  }, [activeTab]);

  const connectProvider = (value: Exclude<Provider, "custom">) => {
    window.location.href = `/api/auth/${value}/connect`;
  };

  const disconnect = async (id: string) => {
    await fetch("/api/accounts/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: id }) });
    await loadAccounts();
    toast.success("تم فصل الحساب");
  };

  const parseCSV = (csv: string) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const imported = (data as any[]).map((row) => ({
          name: row.name || row.Name || row["الاسم"] || "",
          email: row.email || row.Email || row["البريد"] || row["البريد الالكتروني"] || "",
        })).filter((item) => item.email);
        setRecipients((current) => [...current.filter((item) => item.email || item.name), ...imported]);
        toast.success(`تمت إضافة ${imported.length} مستلم`);
      },
      error: () => toast.error("تعذر قراءة ملف CSV"),
    });
  };

  const sendEmails = async () => {
    const currentText = editorRef.current ? JSON.stringify(await editorRef.current.save()) : text;
    if (provider !== "custom" && !accountId) return toast.error("اربط حساب المرسل واختره اولا");
    setIsSending(true); setProgress(0); setSentCount(0); setFailedCount(0);
    const validRecipients = recipients.filter((item) => item.email.trim());
    try {
      const response = await fetch("/api/sendEmails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider, accountId, recipients: validRecipients, subject, text: currentText, useGreeting,
          customSmtp: provider === "custom" ? { ...customSmtp, port: Number(customSmtp.port) } : undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "فشل بدء الارسال");
      }
      if (!response.body) throw new Error("لم يرجع الخادم نتيجة");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split("\n"); pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const data = JSON.parse(line);
          if (data.status === "success") { setSentCount(data.sent); setFailedCount(data.failed); }
          if (data.status === "error") { setSentCount(data.sent); setFailedCount(data.failed); toast.error(`${data.email}: ${data.error}`); }
          if (data.total) setProgress(((data.sent + data.failed) / data.total) * 100);
          if (data.status === "complete") toast.success(`تم ارسال ${data.sent} وفشل ${data.failed}`);
        }
        if (done) break;
      }
    } catch (error) { toast.error((error as Error).message); }
    finally { setIsSending(false); }
  };

  const providerAccounts = accounts.filter((item) => item.provider === provider);

  return (
    <div className="campaign-container container mx-auto max-w-4xl p-4" dir="rtl">
      <Card className="campaign-card">
        <CardHeader className="campaign-header"><div className="campaign-brand"><span className="campaign-dot" /><span>Email Sender</span></div><CardTitle className="text-center text-3xl">نظام ارسال الحملات البريدية</CardTitle><p className="campaign-subtitle">انشئ وارسل حملتك من حساباتك المربوطة بكل سهولة</p></CardHeader>
        <CardContent className="space-y-6">
          {!persistentStoreConfigured && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              التخزين الدائم غير مربوط. محليا يشتغل مؤقتا لكن على Vercel لازم تضيف Upstash Redis او Vercel KV حتى تبقى الحسابات المربوطة محفوظة.
            </div>
          )}

          <div className="space-y-3">
            <Label>مزود البريد</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {(Object.keys(providerLabels) as Provider[]).map((item) => (
                <Button key={item} type="button" variant={provider === item ? "default" : "outline"} onClick={() => setProvider(item)}>
                  {providerLabels[item]}
                </Button>
              ))}
            </div>
            {provider === "microsoft" && <p className="text-sm text-muted-foreground">يدعم Outlook وHotmail وLive وMicrosoft 365 وايميلات GoDaddy المرتبطة باوتلوك</p>}
          </div>

          {provider !== "custom" ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">حسابات {providerLabels[provider]} المربوطة</h3>
                  <p className="text-sm text-muted-foreground">اربط كل حساب مرة واحدة وبعدها اختره وقت الارسال</p>
                </div>
                <Button type="button" onClick={() => connectProvider(provider)}><Link2 className="ml-2 h-4 w-4" />ربط حساب جديد</Button>
              </div>
              {providerAccounts.length ? (
                <div className="space-y-2">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="اختر حساب المرسل" /></SelectTrigger>
                    <SelectContent>{providerAccounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.email}</SelectItem>)}</SelectContent>
                  </Select>
                  {providerAccounts.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md bg-muted p-2 text-sm">
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{item.email}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => disconnect(item.id)}><Unplug className="ml-1 h-4 w-4" />فصل</Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">ما فيه حساب مربوط للحين</p>}
            </div>
          ) : (
            <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
              <div><Label>SMTP Server</Label><Input value={customSmtp.host} onChange={(e) => setCustomSmtp({ ...customSmtp, host: e.target.value })} placeholder="smtp.example.com" /></div>
              <div><Label>Port</Label><Input type="number" value={customSmtp.port} onChange={(e) => setCustomSmtp({ ...customSmtp, port: e.target.value })} /></div>
              <div><Label>البريد او اسم المستخدم</Label><Input value={customSmtp.username} onChange={(e) => setCustomSmtp({ ...customSmtp, username: e.target.value })} /></div>
              <div><Label>كلمة مرور التطبيق</Label><Input type="password" value={customSmtp.password} onChange={(e) => setCustomSmtp({ ...customSmtp, password: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Checkbox checked={customSmtp.secure} onCheckedChange={(checked) => setCustomSmtp({ ...customSmtp, secure: Boolean(checked) })} /><Label>SSL مباشر عادة مع Port 465</Label></div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="compose">الرسالة</TabsTrigger><TabsTrigger value="recipients">المستلمين</TabsTrigger></TabsList>
            <TabsContent value="compose" className="space-y-4">
              <div><Label>عنوان الرسالة</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="اكتب عنوان الرسالة" /></div>
              <div><Label>محتوى الرسالة</Label><div id="editorjs" className="min-h-[220px] rounded-md border bg-white p-3 text-left" dir="ltr" /></div>
              <div className="flex items-center gap-2"><Checkbox checked={useGreeting} onCheckedChange={(checked) => setUseGreeting(Boolean(checked))} /><Label>اضافة Dear واسم المستلم في بداية الرسالة</Label></div>
            </TabsContent>
            <TabsContent value="recipients" className="space-y-4">
              {recipients.map((recipient, index) => (
                <motion.div key={index} className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Input placeholder="اسم المستلم" value={recipient.name} onChange={(e) => setRecipients(recipients.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                  <Input type="email" placeholder="البريد الالكتروني" value={recipient.email} onChange={(e) => setRecipients(recipients.map((item, i) => i === index ? { ...item, email: e.target.value } : item))} />
                  {recipients.length > 1 && <Button type="button" variant="outline" size="icon" onClick={() => setRecipients(recipients.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>}
                </motion.div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setRecipients([...recipients, { name: "", email: "" }])}><Plus className="ml-2 h-4 w-4" />اضافة مستلم</Button>
                <div className="relative flex-1"><Input type="file" accept=".csv" className="absolute inset-0 z-10 h-full cursor-pointer opacity-0" onChange={(e) => { const file = e.target.files?.[0]; if (file) file.text().then(parseCSV); }} /><Button type="button" variant="outline" className="w-full"><Upload className="ml-2 h-4 w-4" />استيراد CSV</Button></div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          {isSending && <div className="w-full"><Progress value={progress} /><p className="mt-2 text-center text-sm">تم {sentCount} فشل {failedCount}</p></div>}
          <Button className="w-full" type="button" disabled={isSending} onClick={sendEmails}><Send className="ml-2 h-4 w-4" />{isSending ? "جاري الارسال" : "ارسال الحملة"}</Button>
        </CardFooter>
      </Card>
      <ToastContainer position="bottom-left" rtl />
    </div>
  );
}
