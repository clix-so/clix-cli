---
name: project-build
description: Build the project using project type and install verification context passed from /install. Validate the provided project type with quick file checks, run the build, and on failure automatically apply fixes and retry without asking for user approval.
---

# Project Build

Use the context already collected by `/install` to run a reliable build and handle failures autonomously.

## Inputs from `/install` (already provided)

Assume these inputs are available in the prompt and use them as the primary source of truth:

- Project path
- Target platform
- Detected project type (framework + target)
- Install-step verification summary (what was completed and validated)
- Firebase/APNS/iOS setup status

Do not rerun previous setup tasks unless file evidence conflicts.

## Step 1: Use Provided Project Type, Then Validate Quickly

Start from the provided project type/target platform. Then run a quick validation scan in parallel using indicator files:

| Indicator Files | Project Type |
|---|---|
| `Podfile` + `*.xcworkspace` | iOS native (CocoaPods) |
| `*.xcodeproj` + `Package.swift` OR `*.xcodeproj` with no `Podfile` | iOS native (SPM) |
| `build.gradle` or `build.gradle.kts` (at root or `app/`) | Android |
| `package.json` with `"react-native"` dependency + `android/` and `ios/` dirs | React Native |
| `package.json` with `"expo"` dependency OR `app.json` with `"expo"` key | Expo |
| `pubspec.yaml` | Flutter |

If the quick validation conflicts with the provided project type, use file-evidence as source of truth, mention the mismatch in output, and continue.

## Step 2: Determine Build Command

### iOS simulator discovery (xcodebuild only)

When using `xcodebuild` (iOS native CocoaPods/SPM), discover available simulators before constructing the command:

```bash
xcrun simctl list devices available -j
```

Choose simulator priority:
1. Latest iOS runtime
2. Highest iPhone model number in that runtime (prefer base iPhone model over Pro/Plus/Max)
3. Fallback to any iPad if no iPhone exists

Use destination:
```
-destination 'platform=iOS Simulator,name=<discovered-device-name>'
```

If simulator discovery fails, inform the user and suggest installing simulators via Xcode.

### Default build commands by project type

**iOS native (CocoaPods)**:
```
pod install --project-directory=<dir-with-Podfile>
xcodebuild -workspace <name>.xcworkspace -scheme <scheme> -configuration Debug -destination 'platform=iOS Simulator,name=<discovered-simulator>' build
```
- Use `xcodebuild -workspace <name>.xcworkspace -list` to list schemes.

**iOS native (SPM)**:
```
xcodebuild -project <name>.xcodeproj -scheme <scheme> -configuration Debug -destination 'platform=iOS Simulator,name=<discovered-simulator>' build
```
- Use `xcodebuild -project <name>.xcodeproj -list` to list schemes.

**Android**:
```
./gradlew assembleDebug
```

**React Native**:
```
npx react-native run-ios
# or
npx react-native run-android
```

**Expo**:
```
npx expo run:ios
# or
npx expo run:android
```

**Flutter**:
```
flutter build ios --debug --no-codesign
# or
flutter build apk --debug
```

### Override detection

Also check for custom build commands:
- `CLAUDE.md`
- `Makefile` (`build` target)
- `package.json` scripts (`build`, `ios`, `android`)
- `Justfile` / `Taskfile.yml`
- `fastlane/Fastfile`

Prefer custom commands when valid.

## Step 3: Finalize Build Plan and Execute

Before running build, summarize internally:
1. Project type from `/install`
2. Install-step verification summary (completed + missing)
3. Build command that will run
4. Simulator/device info (for iOS `xcodebuild`)

Do not ask for approval. Proceed immediately with the best command.

## Step 4: Execute Build

Run the confirmed command with Bash (timeout up to `600000ms`).

After build:
- On success: provide concise success summary and key output artifacts.
- On failure: provide error summary (first root-cause lines + failing command).

## Step 5: On Build Failure, Auto-Fix and Retry

After a failed build, do not stop for approval.

- Apply minimal targeted fixes automatically.
- Retry build after each fix.
- Repeat until build succeeds or a hard blocker remains (missing secrets, account permissions, unavailable external service).
- For hard blockers, stop and clearly report blocker + exact action required from user.

## Step 6: Build Failure Checklist to Show User

Provide a quick checklist when build fails (including intermediate retries):

**Common**
- Dependencies installed and lockfiles are in sync (`bun install`/`npm install`/`yarn`/`pnpm install`)
- Clean stale caches/build artifacts
- Correct CLI/toolchain versions (Node, Java, Flutter, Xcode CLT)

**iOS**
- Correct workspace/project and scheme
- Simulator exists and is bootable
- CocoaPods installed (`pod install`) when using pods
- Signing/capabilities/provisioning consistency
- Firebase plist, entitlements, and NSE files/targets linked correctly

**Android**
- Gradle sync and compatible JDK/SDK versions
- `google-services.json` path and Google Services plugin setup
- Build variant/task matches project structure

**React Native / Expo**
- `node_modules` installed
- iOS pods installed (`cd ios && pod install`) for iOS build paths
- Correct run command for target platform

**Flutter**
- `flutter pub get` completed
- iOS pods/Xcode toolchain healthy for iOS builds
- Target device/emulator availability
