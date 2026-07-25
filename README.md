# mails-sender-apis

واجهة Next.js على Vercel مع تخزين دائم في Supabase لإرسال الحملات عبر Google وMicrosoft وZoho وSMTP مخصص.

## المزايا

- ربط OAuth محفوظ بعد إعادة النشر.
- استيراد Excel (`.xlsx` و`.xls`) أو CSV.
- قراءة أعمدة الاسم والبريد بالعربية أو الإنجليزية.
- إزالة البريد المكرر وتجاهل البريد غير الصحيح.
- عدادات: تم تجهيز العملاء، تم الإرسال، فشل الإرسال، المتبقي.
- فاصل زمني يحدده المستخدم بين الرسائل.
- حفظ الحملة وحالة كل مستلم وسبب الفشل في Supabase.
- زر إعادة محاولة عناوين البريد التي فشل إرسالها فقط.
- محرر تصميم وHTML ومعاينة، مع الحفاظ على ربط Google والمسارات الحالية.

## إعداد Supabase

1. افتح `Supabase > SQL Editor`.
2. انسخ كامل محتوى الملف `supabase/schema.sql`.
3. اضغط **Run** مرة واحدة.
4. أضف في Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

المفتاح السري يبقى في Vercel فقط ولا يوضع في GitHub أو الواجهة.

## متغيرات Vercel

أضف جميع القيم الموجودة في `.env.example` على Production ثم نفذ Redeploy.

## OAuth callback URLs

```text
https://YOUR-DOMAIN/api/auth/google/callback
https://YOUR-DOMAIN/api/auth/microsoft/callback
https://YOUR-DOMAIN/api/auth/zoho/callback
```

لا تغيّر هذه المسارات عند تحديث المشروع حتى لا يتعطل ربط OAuth.

## تنسيق ملف Excel

يجب أن يحتوي الصف الأول على عناوين أعمدة. الأسماء المدعومة:

- الاسم: `name` أو `Name` أو `الاسم` أو `اسم` أو `اسم المستلم`
- البريد: `email` أو `Email` أو `البريد` أو `الايميل` أو `البريد الالكتروني` أو `البريد الإلكتروني`

## الفحص

بعد النشر افتح:

```text
/api/health
```

ويفترض أن تكون `persistentStoreConfigured` بقيمة `true`.
