/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bold,
  CheckCircle2,
  Code2,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Plus,
  Redo2,
  Send,
  Trash2,
  Underline,
  Undo2,
  Unplug,
  Upload,
  RotateCcw,
  Clock3,
  Users,
  MailCheck,
  MailX,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
interface FailedRecipient extends Recipient { error: string }
type Provider = "google" | "microsoft" | "zoho" | "custom";
interface Account { id: string; provider: Exclude<Provider, "custom">; email: string; displayName?: string }

const providerLabels: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  zoho: "Zoho",
  custom: "بريد مخصص",
};

const emptyTemplate = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#28194d;padding:24px">
  <h2 style="margin:0 0 16px">عنوان الحملة</h2>
  <p style="margin:0">اكتب محتوى الرسالة هنا او الصق قالب HTML كامل</p>
</div>`;

function friendlyOAuthError(value: string) {
  if (value.includes("GOOGLE_CLIENT_ID")) return "اعدادات ربط Google غير مكتملة";
  if (value.includes("MICROSOFT_CLIENT_ID")) return "اعدادات ربط Microsoft غير مكتملة";
  if (value.includes("ZOHO_CLIENT_ID")) return "اعدادات ربط Zoho غير مكتملة";
  return value;
}

export default function EmailCampaignTool() {
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: "", email: "" }]);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(emptyTemplate);
  const [editorMode, setEditorMode] = useState<"visual" | "html" | "preview">("visual");
  const [provider, setProvider] = useState<Provider>("google");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [activeTab, setActiveTab] = useState("compose");
  const [useGreeting, setUseGreeting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [failedRecipients, setFailedRecipients] = useState<FailedRecipient[]>([]);
  const [lastCampaignId, setLastCampaignId] = useState("");
  const [preparedCount, setPreparedCount] = useState(0);
  const [customSmtp, setCustomSmtp] = useState({ host: "", port: "587", secure: false, username: "", password: "" });
  const visualEditorRef = useRef<HTMLDivElement | null>(null);

  const loadAccounts = async () => {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    const data = await response.json();
    setAccounts(data.accounts || []);
  };

  useEffect(() => {
    loadAccounts().catch(() => toast.error("تعذر تحميل الحسابات"));
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauth_error");
    if (connected) toast.success("تم ربط الحساب");
    if (oauthError) toast.error(friendlyOAuthError(oauthError));
    if (connected || oauthError) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const matching = accounts.filter((item) => item.provider === provider);
    if (provider !== "custom" && !matching.some((item) => item.id === accountId)) setAccountId(matching[0]?.id || "");
  }, [provider, accounts, accountId]);

  useEffect(() => {
    if (editorMode === "visual" && visualEditorRef.current && visualEditorRef.current.innerHTML !== html) {
      visualEditorRef.current.innerHTML = html;
    }
  }, [editorMode, html]);

  const runEditorCommand = (command: string, value?: string) => {
    visualEditorRef.current?.focus();
    document.execCommand(command, false, value);
    setHtml(visualEditorRef.current?.innerHTML || "");
  };

  const connectProvider = (value: Exclude<Provider, "custom">) => {
    window.location.href = `/api/auth/${value}/connect`;
  };

  const disconnect = async (id: string) => {
    await fetch("/api/accounts/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: id }),
    });
    await loadAccounts();
    toast.success("تم فصل الحساب");
  };

  const normalizeImportedRows = (rows: any[]) => {
    const imported = rows.map((row) => ({
      name: String(row.name || row.Name || row.NAME || row["الاسم"] || row["اسم"] || row["اسم المستلم"] || "").trim(),
      email: String(row.email || row.Email || row.EMAIL || row["البريد"] || row["الايميل"] || row["البريد الالكتروني"] || row["البريد الإلكتروني"] || "").trim(),
    })).filter((item) => item.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email));
    const unique = Array.from(new Map(imported.map((item) => [item.email.toLowerCase(), item])).values());
    setRecipients(unique.length ? unique : [{ name: "", email: "" }]);
    setPreparedCount(unique.length);
    setSentCount(0);
    setFailedCount(0);
    setFailedRecipients([]);
    setProgress(0);
    toast.success(`تم تجهيز ${unique.length} عميل`);
  };

  const parseCSV = (csv: string) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => normalizeImportedRows(data as any[]),
      error: () => toast.error("تعذر قراءة الملف"),
    });
  };

  const parseExcel = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("الملف لا يحتوي على ورقة");
      normalizeImportedRows(XLSX.utils.sheet_to_json(firstSheet, { defval: "" }) as any[]);
    } catch {
      toast.error("تعذر قراءة ملف الاكسل");
    }
  };

  const sendEmails = async (retryList?: FailedRecipient[]) => {
    if (provider !== "custom" && !accountId) return toast.error("اربط حساب المرسل اولا");
    if (!subject.trim()) return toast.error("اكتب عنوان الرسالة");
    if (!html.trim()) return toast.error("اكتب محتوى الرسالة");

    const validRecipients = (retryList || recipients).filter((item) => item.email.trim());
    if (!validRecipients.length) return toast.error("لا يوجد مستلمين جاهزين");

    setPreparedCount(validRecipients.length);
    setIsSending(true);
    setProgress(0);
    setSentCount(0);
    setFailedCount(0);
    setFailedRecipients([]);

    try {
      const campaignResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          accountId,
          recipients: validRecipients,
          subject,
          html,
          useGreeting,
          delayMs: Math.max(1, delaySeconds) * 1000,
          retryCampaignId: retryList?.length ? lastCampaignId : undefined,
        }),
      });
      const campaignData = await campaignResponse.json().catch(() => ({}));
      if (!campaignResponse.ok) throw new Error(campaignData.error || "فشل تجهيز الحملة");
      const campaignId = String(campaignData.campaignId);
      setLastCampaignId(campaignId);
      toast.success(`تم تجهيز ${campaignData.prepared} عميل`);

      let sent = 0;
      let failed = 0;
      const failures: FailedRecipient[] = [];

      for (let index = 0; index < validRecipients.length; index++) {
        const recipient = validRecipients[index];
        try {
          const response = await fetch("/api/sendEmails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              accountId,
              recipients: [recipient],
              subject,
              html,
              useGreeting,
              customSmtp: provider === "custom" ? { ...customSmtp, port: Number(customSmtp.port) } : undefined,
              campaignId,
              singleMode: true,
            }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "فشل الارسال");
          }
          if (!response.body) throw new Error("لم يرجع الخادم نتيجة");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          let recipientFailed: FailedRecipient | null = null;
          while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value || new Uint8Array(), { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const data = JSON.parse(line);
              if (data.status === "error") recipientFailed = { ...recipient, error: data.error };
            }
            if (done) break;
          }
          if (recipientFailed) throw new Error(recipientFailed.error);
          sent++;
        } catch (error) {
          failed++;
          const failedItem = { ...recipient, error: (error as Error).message };
          failures.push(failedItem);
          toast.error(`${recipient.email}: ${failedItem.error}`);
        }

        setSentCount(sent);
        setFailedCount(failed);
        setFailedRecipients([...failures]);
        setProgress(((sent + failed) / validRecipients.length) * 100);

        if (index < validRecipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(1, delaySeconds) * 1000));
        }
      }

      await fetch("/api/campaigns/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, hasErrors: failed > 0 }),
      });
      toast.success(`تم ارسال ${sent} وفشل ${failed}`);
    } catch (error) {
      toast.error(friendlyOAuthError((error as Error).message));
    } finally {
      setIsSending(false);
    }
  };

  const providerAccounts = accounts.filter((item) => item.provider === provider);

  return (
    <div className="campaign-container container mx-auto max-w-5xl p-4" dir="rtl">
      <Card className="campaign-card">
        <CardHeader className="campaign-header">
          <div className="campaign-brand"><span className="campaign-dot" /><span>Email Sender</span></div>
          <CardTitle className="text-center text-3xl">ارسال حملة بريدية</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>تم تجهيز العملاء</span><Users className="h-4 w-4" /></div><div className="mt-2 text-2xl font-bold">{preparedCount || recipients.filter((item) => item.email.trim()).length}</div></div>
            <div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>تم الارسال</span><MailCheck className="h-4 w-4" /></div><div className="mt-2 text-2xl font-bold">{sentCount}</div></div>
            <div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>فشل الارسال</span><MailX className="h-4 w-4" /></div><div className="mt-2 text-2xl font-bold">{failedCount}</div></div>
            <div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>المتبقي</span><Clock3 className="h-4 w-4" /></div><div className="mt-2 text-2xl font-bold">{Math.max(0, (preparedCount || recipients.filter((item) => item.email.trim()).length) - sentCount - failedCount)}</div></div>
          </div>
          <div className="space-y-3">
            <Label>مزود البريد</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {(Object.keys(providerLabels) as Provider[]).map((item) => (
                <Button key={item} type="button" variant={provider === item ? "default" : "outline"} onClick={() => setProvider(item)}>
                  {providerLabels[item]}
                </Button>
              ))}
            </div>
          </div>

          {provider !== "custom" ? (
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">حساب المرسل</h3>
                <Button type="button" onClick={() => connectProvider(provider)}><Link2 className="ml-2 h-4 w-4" />ربط حساب</Button>
              </div>
              {providerAccounts.length ? (
                <div className="space-y-2">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="اختر حساب المرسل" /></SelectTrigger>
                    <SelectContent>{providerAccounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.email}</SelectItem>)}</SelectContent>
                  </Select>
                  {providerAccounts.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted p-2 text-sm">
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{item.email}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => disconnect(item.id)}><Unplug className="ml-1 h-4 w-4" />فصل</Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2">
              <div><Label>SMTP Server</Label><Input value={customSmtp.host} onChange={(e) => setCustomSmtp({ ...customSmtp, host: e.target.value })} placeholder="smtp.example.com" /></div>
              <div><Label>Port</Label><Input type="number" value={customSmtp.port} onChange={(e) => setCustomSmtp({ ...customSmtp, port: e.target.value })} /></div>
              <div><Label>البريد او اسم المستخدم</Label><Input value={customSmtp.username} onChange={(e) => setCustomSmtp({ ...customSmtp, username: e.target.value })} /></div>
              <div><Label>كلمة مرور التطبيق</Label><Input type="password" value={customSmtp.password} onChange={(e) => setCustomSmtp({ ...customSmtp, password: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Checkbox checked={customSmtp.secure} onCheckedChange={(checked) => setCustomSmtp({ ...customSmtp, secure: Boolean(checked) })} /><Label>SSL</Label></div>
            </div>
          )}

          <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><Label>الوقت بين كل رسالة والثانية</Label><p className="text-xs text-muted-foreground">من 1 الى 600 ثانية</p></div>
              <div className="flex items-center gap-2"><Input className="w-28" type="number" min={1} max={600} value={delaySeconds} onChange={(e) => setDelaySeconds(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} /><span>ثانية</span></div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="compose">الرسالة</TabsTrigger><TabsTrigger value="recipients">المستلمين</TabsTrigger></TabsList>
            <TabsContent value="compose" className="space-y-4">
              <div><Label>عنوان الرسالة</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="اكتب عنوان الرسالة" /></div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>محتوى الرسالة</Label>
                  <div className="flex rounded-xl border bg-white p-1">
                    <Button type="button" size="sm" variant={editorMode === "visual" ? "default" : "ghost"} onClick={() => setEditorMode("visual")}>تصميم</Button>
                    <Button type="button" size="sm" variant={editorMode === "html" ? "default" : "ghost"} onClick={() => setEditorMode("html")}><Code2 className="ml-1 h-4 w-4" />HTML</Button>
                    <Button type="button" size="sm" variant={editorMode === "preview" ? "default" : "ghost"} onClick={() => setEditorMode("preview")}><Eye className="ml-1 h-4 w-4" />معاينة</Button>
                  </div>
                </div>

                {editorMode === "visual" && (
                  <div className="html-editor-shell">
                    <div className="html-editor-toolbar" dir="ltr">
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("undo")} title="Undo"><Undo2 className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("redo")} title="Redo"><Redo2 className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("bold")} title="Bold"><Bold className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("italic")} title="Italic"><Italic className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("underline")} title="Underline"><Underline className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("insertUnorderedList")} title="List"><List className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => runEditorCommand("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Button>
                    </div>
                    <div
                      ref={visualEditorRef}
                      className="html-visual-editor"
                      contentEditable
                      suppressContentEditableWarning
                      dir="rtl"
                      onInput={(event) => setHtml(event.currentTarget.innerHTML)}
                    />
                  </div>
                )}

                {editorMode === "html" && (
                  <textarea
                    className="html-code-editor"
                    dir="ltr"
                    spellCheck={false}
                    value={html}
                    onChange={(event) => setHtml(event.target.value)}
                    placeholder="الصق كود HTML هنا"
                  />
                )}

                {editorMode === "preview" && (
                  <iframe className="html-preview" title="معاينة الرسالة" srcDoc={html} sandbox="allow-same-origin" />
                )}
              </div>

              <div className="flex items-center gap-2"><Checkbox checked={useGreeting} onCheckedChange={(checked) => setUseGreeting(Boolean(checked))} /><Label>اضافة Dear واسم المستلم</Label></div>
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
                <div className="relative flex-1"><Input type="file" accept=".xlsx,.xls,.csv" className="absolute inset-0 z-10 h-full cursor-pointer opacity-0" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.name.toLowerCase().endsWith(".csv")) file.text().then(parseCSV); else parseExcel(file); e.currentTarget.value = ""; }} /><Button type="button" variant="outline" className="w-full"><Upload className="ml-2 h-4 w-4" />استيراد Excel او CSV</Button></div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex-col gap-3">
          {(isSending || sentCount > 0 || failedCount > 0) && <div className="w-full"><Progress value={progress} /><p className="mt-2 text-center text-sm">تم {sentCount} فشل {failedCount} من {sentCount + failedCount + Math.max(0, (preparedCount || recipients.filter((item) => item.email.trim()).length) - sentCount - failedCount)}</p></div>}
          {failedRecipients.length > 0 && !isSending && <Button className="w-full" type="button" variant="outline" onClick={() => sendEmails(failedRecipients)}><RotateCcw className="ml-2 h-4 w-4" />اعادة محاولة فشل الارسال ({failedRecipients.length})</Button>}
          <Button className="w-full" type="button" disabled={isSending} onClick={() => sendEmails()}><Send className="ml-2 h-4 w-4" />{isSending ? "جاري الارسال" : "ارسال الحملة"}</Button>
        </CardFooter>
      </Card>
      <ToastContainer position="bottom-left" rtl />
    </div>
  );
}
