# نشر تطبيق فلسي — Google Play و App Store و Microsoft Store

هذا الدليل يغطي كل ما تطلبه المتاجر الثلاثة حتى ينقبل التطبيق من أول مرة. التطبيق جاهز لهذه المتطلبات في الكود. الباقي إعدادات تسويها أنت في حسابات المتاجر.

---

## 0) قبل كل شيء

| المطلوب | التفاصيل |
|---|---|
| حساب **Google Play Console** | 25$ مرة وحدة. **حساب منشأة (Organization)** أفضل: يحتاج رقم D-U-N-S (مجاني) ويعفيك من شرط الاختبار المغلق (12 مختبر × 14 يوم) المفروض على الحسابات الشخصية الجديدة |
| حساب **Apple Developer** | 99$ سنوياً. حساب منشأة يحتاج D-U-N-S. **ضروري حتى للتثبيت على جوالك** (عن طريق TestFlight) |
| حساب **Microsoft Partner Center** | مجاني (أفراد ومنشآت) |
| **حساب تجريبي للمراجعين** | منشأة تجريبية كاملة الإعداد (منتجات + فرع + PIN مدير). آبل وجوجل يرفضون التطبيق إذا ما قدروا يدخلون |
| **سياسة الخصوصية** | `https://felsy.org/privacy` (فيها قسم التطبيق وقسم حذف الحساب) |
| **رابط حذف الحساب** (جوجل) | `https://felsy.org/privacy#delete-account` |
| **الدعم** | `https://felsy.org/support` و `info@felsy.org` |

> **ارفع الموقع أولاً.** صفحة الخصوصية المحدّثة جزء من هذا الإصدار، والمتاجر تفحص الرابط.

### الحساب التجريبي للمراجعين
1. سجّل منشأة جديدة من الموقع مثل `review@felsy.org`، وفعّل لها اشتراك (من لوحة المالك).
2. أكمل الإعداد: فرع، 5 منتجات، رمز PIN للمدير مثل `1234`.
3. **لا تربطها بالهيئة في بيئة الإنتاج.** خلّها بدون ربط أو اربطها بالمحاكاة.
4. اكتب البيانات في خانة ملاحظات المراجعة (App Review Information في آبل و App access في جوجل):
   ```
   Email: review@felsy.org   Password: ********   PIN: 1234
   The app is a point-of-sale & accounting system for businesses in Saudi Arabia.
   Accounts are created by the business owner on felsy.org (B2B). Sign in, enter PIN 1234.
   ```

---

## 1) GitHub — البناء التلقائي

الملف: `.github/workflows/app.yml`. يبني أندرويد وآيفون وويندوز على خوادم GitHub، فما تحتاج تثبّت شي على جهازك.

**التشغيل:** GitHub ← Actions ← **Felsy App** ← Run workflow (أو ارفع وسم `app-v1.0.0`).
**الناتج:** في صفحة التشغيل تحت Artifacts:
- `felsy-android`: يحتوي `app-release.aab` للمتجر و`app-release.apk` تثبّته مباشرة على جوالك الأندرويد.
- `felsy-windows`: يحتوي `felsy.msix` و`felsy-windows.zip` (فك الضغط ← شغّل `felsy.exe`).
- آيفون: يرتفع تلقائياً لـ TestFlight.

رقم البناء (Build number) يزيد تلقائياً مع كل تشغيل. اسم الإصدار تغيّره من `app/pubspec.yaml` في السطر `version: 1.0.0+1`.

### الأسرار (Settings ← Secrets and variables ← Actions)

**أندرويد** — أنشئ مفتاح الرفع **مرة وحدة** واحفظه بمكان آمن، لأن ضياعه يعني إنك ما تقدر تحدّث التطبيق:
```bash
keytool -genkey -v -keystore felsy-upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias felsy
base64 -w0 felsy-upload.jks   # (ماك: base64 -i felsy-upload.jks)
```
| السر | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ناتج base64 |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور الملف |
| `ANDROID_KEY_ALIAS` | `felsy` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح |

**آيفون** — من App Store Connect ← Users and Access ← Integrations ← **App Store Connect API** ← (+) بصلاحية **App Manager**:
| السر | القيمة |
|---|---|
| `APPLE_TEAM_ID` | من developer.apple.com ← Membership (10 حروف) |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | `base64 -i AuthKey_XXXX.p8` |

**ويندوز** (في تبويب Variables وليس Secrets) — من Partner Center ← المنتج ← Product identity:
| المتغير | القيمة |
|---|---|
| `MSIX_PUBLISHER` | `CN=XXXXXXXX-XXXX-...` |
| `MSIX_IDENTITY_NAME` | مثل `12345Felsy.Felsy` |
| `MSIX_PUBLISHER_DISPLAY_NAME` | اسم الناشر |

---

## 2) Google Play

1. **Create app**: الاسم `فلسي - نقاط بيع ومحاسبة`، لغة افتراضية العربية، App (وليس Game)، Free.
2. **App content** (أهم قسم):
   - **Privacy policy:** `https://felsy.org/privacy`
   - **App access:** "All or some functionality is restricted" ← أضف الحساب التجريبي.
   - **Ads:** No.
   - **Content rating:** استبيان IARC ← Utility / Productivity ← كل الإجابات "لا".
   - **Target audience:** 18+ فقط.
   - **Data safety** — الإجابات المطابقة للتطبيق:
     | السؤال | الإجابة |
     |---|---|
     | هل يجمع أو يشارك بيانات؟ | يجمع: نعم. يشارك: **لا** (إرسال الفواتير للهيئة التزام نظامي وليس مشاركة) |
     | تشفير أثناء النقل | نعم |
     | طريقة لطلب حذف البيانات | نعم ← `https://felsy.org/privacy#delete-account` |
     | الأنواع | Personal info: Name, Email, Phone number, User IDs. Financial info: Purchase history, Other financial info. كلها: Collected، **App functionality**، Not optional للحساب |
     | الموقع، الصور، جهات الاتصال، المعرّفات الإعلانية | **لا** |
   - **Financial features:** ما يقدم خدمات مالية للأفراد. اختر "لا" لكل الخيارات، أو "Other" مع الوصف: POS & invoicing software for businesses.
   - **Government apps:** No.
3. **Store listing**: الأيقونة 512×512 (`app/assets/branding/app_logo_512.png`)، Feature graphic مقاس 1024×500، ومن 2 إلى 8 لقطات شاشة للجوال ولقطات للتابلت 10 بوصة.
4. **Release**: ابدأ بـ **Internal testing** ← ارفع `app-release.aab` ← جرّبه على جوالك ← بعدها Production.
   - **Play App Signing** يتفعّل تلقائياً، و`felsy-upload.jks` يصير مفتاح الرفع.
   - **الحساب الشخصي الجديد:** لازم Closed testing مع 12 مختبراً لمدة 14 يوماً قبل Production. هذا الشرط ما ينطبق على حساب المنشأة.

**جاهز في الكود لمتطلبات جوجل:**
- `targetSdk 36`، وهو المطلوب من 31 أغسطس 2026.
- إذن الإشعارات يُطلب **داخل التطبيق بعد شرح**، وأول مرة فقط.
- ما فيه أي إذن حساس (موقع، كاميرا، ملفات، جهات اتصال، تنبيهات دقيقة، خدمة أمامية).
- النسخ الاحتياطي معطّل لبيانات المنشأة.
- ما فيه حركة HTTP غير مشفّرة.
- حذف الحساب متاح داخل التطبيق، ورابطه متاح على الويب.
- ما فيه أي رابط لشراء أو تجديد الاشتراك داخل التطبيق، وهذا يلتزم بسياسة الدفع.

---

## 3) App Store (آيفون وآيباد)

1. developer.apple.com ← Identifiers ← (+) App ID: `org.felsy.app`. ما يحتاج أي Capability إضافية.
2. App Store Connect ← Apps ← (+) New App:
   - Platform: iOS، الاسم `فلسي - نقاط بيع ومحاسبة`، Primary language: Arabic.
   - Bundle ID: `org.felsy.app`، SKU: `felsy-ios`.
3. شغّل الـ workflow، فيظهر البناء في **TestFlight** بعد 10 إلى 30 دقيقة. أضف نفسك في Internal Testing، وثبّت **TestFlight** من App Store على جوالك، وجرّب.
4. **App Privacy** (Data Types) — نفس ملف `ios/Runner/PrivacyInfo.xcprivacy`:
   - Contact Info: Name, Email Address, Phone Number.
   - Identifiers: User ID.
   - Purchases: Purchase History.
   - Financial Info: Other Financial Info.
   - كلها **Linked to user** و**App Functionality**. Tracking: **No**.
5. **Age rating**: كل الإجابات "None"، والنتيجة 4+.
6. **Category**: Business (والثانوية Finance).
7. **App Review Information**: الحساب التجريبي مع الملاحظة المذكورة فوق (B2B، الحسابات تنشئها المنشأة).
8. **Pricing**: Free. **لا** تفعّل In-App Purchase.
9. Submit for Review.

**جاهز في الكود لمتطلبات آبل:**
- Privacy Manifest موجود ومربوط بالمشروع، ويشمل أسباب واجهات النظام.
- `ITSAppUsesNonExemptEncryption = NO`، فما يحتاج وثائق تصدير.
- وصف إذن الشبكة المحلية بالعربي (للطابعة).
- الإشعارات تنطلب بعد شرح فقط.
- **حذف الحساب داخل التطبيق** (Guideline 5.1.1(v)): الإعدادات ← الأمان. المالك يحذف مباشرة، والموظف يرسل طلب.
- **ما فيه أي توجيه لشراء الاشتراك خارج التطبيق** (Guideline 3.1.1). رسالة "الاشتراك غير فعّال" محايدة وبدون روابط أو أسعار.
- ما فيه تسجيل دخول بجوجل/فيسبوك، فما يلزم Sign in with Apple.
- ما فيه تتبّع ولا إعلانات ولا SDK خارجي.
- يُبنى بـ Xcode 26 (`macos-26`)، وهو المطلوب منذ 28 أبريل 2026.

> **ملاحظة:** إذا رفض المراجع بحجة 3.1.1 لأن التطبيق يحتاج اشتراك، رد عليه:
> *"Felsy is a business (B2B) POS & accounting service sold directly to organizations. The app contains no purchasing, pricing or links to purchase (Guideline 3.1.3(c) Enterprise Services / multi-platform services)."*

---

## 4) Microsoft Store (ويندوز)

1. Partner Center ← Apps and games ← New product ← **MSIX or PWA app** ← احجز الاسم `فلسي` أو `Felsy POS`.
2. انسخ قيم Product identity إلى متغيرات GitHub (قسم 1)، وشغّل الـ workflow، وخذ `felsy.msix`.
3. Submission:
   - Pricing: Free، Markets: Saudi Arabia (أو كل الأسواق).
   - Properties: Category **Business**. Privacy policy: `https://felsy.org/privacy`.
   - Age ratings: استبيان IARC ← Productivity.
   - Packages: ارفع `felsy.msix`.
   - Store listing بالعربي: وصف، و1 إلى 10 لقطات شاشة بمقاس 1366×768 أو أكبر.
   - Notes for certification: الحساب التجريبي.
4. Submit. المراجعة عادة من 1 إلى 3 أيام.

**جاهز في الكود:**
- صلاحيات MSIX محصورة في `internetClient` و`privateNetworkClientServer` (للطابعة) فقط.
- إشعارات ويندوز مربوطة بـ toast activator.
- اسم وأيقونة عربية.

**للتجربة على كمبيوترك قبل المتجر:** فك `felsy-windows.zip` وشغّل `felsy.exe` مباشرة، وما يحتاج تثبيت.

---

## 5) بعد النشر — التحديثات

1. غيّر `version:` في `app/pubspec.yaml` (مثلاً `1.0.1+1`).
2. شغّل الـ workflow:
   - **جوجل**: ارفع AAB جديد.
   - **آبل**: يرتفع تلقائياً، ثم Submit.
   - **مايكروسوفت**: Update submission ← حزمة جديدة.
3. أي تغيير على القاعدة يكون **متوافق مع النسخ القديمة**، لأن الناس ما يحدّثون في نفس اليوم.

## 6) إذا فشل البناء

| المشكلة | الحل |
|---|---|
| `macos-26` غير متوفر | غيّر `runs-on: macos-26` إلى `macos-15` وأضف خطوة `sudo xcode-select -s /Applications/Xcode_26*.app` |
| خطأ من AGP 9 / Kotlin في إضافة | في `android/settings.gradle.kts`: `com.android.application` ← `8.11.1`، و`org.jetbrains.kotlin.android` ← `2.2.20`. وفي `gradle/wrapper/gradle-wrapper.properties` ← `gradle-8.14.3` |
| إصدار Flutter غير موجود | غيّر `FLUTTER_VERSION` في الـ workflow لآخر stable |
| `No profiles for 'org.felsy.app'` | تأكد إن App ID مسجّل، وإن مفتاح API بصلاحية App Manager |
