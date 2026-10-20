# R8 rules for the release APK (build.gradle: minifyEnabled true). Be generous: a broken release
# auto-installs on the phone, and the app's own code is small, so keeping it whole costs almost nothing.
# The size win is R8 removing the unused parts of androidx.core / androidx.webkit.

# The JavaScript bridge: app.js calls window.LevelUpAndroid.<method>() by name
# (MainActivity: web.addJavascriptInterface(new Bridge(), "LevelUpAndroid")). WebView finds those
# methods by reflection and only exposes ones carrying the annotation, so keep the methods, their
# names and the annotation itself.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class app.levelup.MainActivity$Bridge { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# All of the app's own classes, unrenamed and with every member: the activities, the accessibility
# service (LimitService, bound by the system from the manifest; its ComponentName is also flattened to a
# string and compared with Settings.Secure enabled_accessibility_services in ScreenTime), the bridge,
# and the helpers. Nothing in the app uses reflection, but this rules out any surprise in names.
-keep class app.levelup.** { *; }

# The one manifest component from a library: Android instantiates it by name for the update installer
# and the share sheet (aapt2 generates a keep for it too; this is the belt to its braces).
-keep class androidx.core.content.FileProvider { *; }

# Readable stack traces from a release build (costs a few KB).
-keepattributes SourceFile,LineNumberTable
