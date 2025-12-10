# Wanderlog App

A smart travel planning application built with Flutter for iOS, Android, and Web.

## 🚀 Getting Started

### Prerequisites

- Flutter SDK (>=3.4.0)
- Dart SDK (>=3.4.0)
- Xcode (for iOS development)
- Android Studio (for Android development)
- VS Code or Android Studio (recommended IDEs)

### Installation

1. Install Flutter: https://flutter.dev/docs/get-started/install

2. Clone the repository:
```bash
git clone <repository-url>
cd wanderlog/wanderlog_app
```

3. Install dependencies:
```bash
flutter pub get
```

4. Set up environment variables:
```bash
# Copy the example env file
cp .env.dev.example .env.dev

# Edit .env.dev with your API keys and configuration
```

5. Run code generation (if needed):
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### Running the App

#### Development
```bash
flutter run -d chrome  # Web
flutter run -d ios      # iOS Simulator
flutter run -d android  # Android Emulator
```

#### Build
```bash
# Web
flutter build web

# iOS
flutter build ios

# Android
flutter build apk  # or flutter build appbundle
```

## 📁 Project Structure

```
lib/
├── core/                    # Core functionality
│   ├── constants/          # App constants
│   ├── network/            # Network layer (Dio client)
│   ├── storage/            # Storage layer (Secure storage, SharedPreferences)
│   └── utils/              # Utility functions
├── features/               # Feature modules
│   ├── auth/               # Authentication module
│   ├── trips/              # Trips module
│   ├── maps/               # Maps module
│   ├── spots/              # Spots module
│   └── payment/            # Payment module
├── shared/                 # Shared components
│   ├── widgets/           # Reusable widgets
│   └── models/            # Shared data models
└── services/              # Service layer
```

## 🛠️ Tech Stack

- **Framework**: Flutter 3.24+
- **State Management**: Riverpod
- **Routing**: GoRouter
- **Network**: Dio
- **Local Storage**: Hive, SharedPreferences, Flutter Secure Storage
- **Maps**: Mapbox Maps Flutter SDK
- **Authentication**: Google Sign-In, Firebase Auth
- **Payment**: Flutter Stripe

## 📝 Development Guidelines

- Follow the [Flutter Style Guide](https://flutter.dev/docs/development/ui/widgets-intro)
- Use `flutter analyze` to check code quality
- Run `flutter format .` before committing
- Write tests for critical functionality

## 🔐 Environment Variables

Create `.env.dev`, `.env.staging`, and `.env.production` files with the following variables:

- `API_BASE_URL`: Backend API base URL
- `MAPBOX_ACCESS_TOKEN`: Mapbox access token
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `STRIPE_PUBLISHABLE_KEY`: Stripe publishable key
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: AI service API keys

## 📱 Platform-Specific Setup

### iOS
1. Open `ios/Runner.xcworkspace` in Xcode
2. Configure signing and capabilities
3. Add GoogleService-Info.plist for Firebase/Google Sign-In

### Android
1. Configure `android/app/build.gradle`
2. Add `google-services.json` for Firebase/Google Sign-In
3. Configure signing configs for release builds

### Web
1. Configure CORS settings if needed
2. Set up hosting (Firebase Hosting, Vercel, etc.)

## 🧪 Testing

```bash
# Run unit tests
flutter test

# Run integration tests
flutter test integration_test/
```

## 📄 License

[Your License Here]

