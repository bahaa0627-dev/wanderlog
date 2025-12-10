# Wanderlog iOS App (Flutter)

A smart travel planning application for iOS, Android, and Web.

## Prerequisites

- Flutter SDK (>=3.4.0)
- Dart SDK
- Xcode (for iOS development)
- Node.js (for backend)

## Setup

### 1. Install Dependencies

```bash
flutter pub get
```

### 2. Environment Configuration

Copy the `.env.dev` file and configure your API keys:

```bash
cp .env.dev .env
```

Update the following values in `.env.dev`:
- `API_BASE_URL`: Your backend API URL (default: http://localhost:3000/api)
- `MAPBOX_ACCESS_TOKEN`: Get from https://mapbox.com
- `GOOGLE_CLIENT_ID`: Get from Google Cloud Console
- `STRIPE_PUBLISHABLE_KEY`: Get from Stripe Dashboard

### 3. Generate Code

Run build_runner to generate JSON serialization code:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### 4. iOS Setup

Update `ios/Runner/Info.plist` with location permissions:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to show nearby spots</string>
<key>NSLocationAlwaysUsageDescription</key>
<string>We need your location to show nearby spots</string>
```

### 5. Run the App

```bash
flutter run
```

## Project Structure

```
lib/
├── core/               # Core utilities (network, storage, constants)
├── features/           # Feature modules
│   ├── auth/          # Authentication
│   ├── trips/         # Trip management
│   └── map/           # Map and spot discovery
└── shared/            # Shared models and utilities
```

## Features

### Phase 1 (Current)
- ✅ User authentication (login/register)
- ✅ Trip management (create, list, view)
- ✅ Spot management (wishlist, today's plan, visited)
- ✅ Map view with markers
- ✅ Tag-based filtering
- ✅ Check-in flow with ratings and notes

### Phase 2 (Upcoming)
- Photo upload for visited spots
- AI-powered photo recognition
- Stripe payment integration
- Social sharing features

## Backend

Make sure the backend API is running before using the app:

```bash
cd ../wanderlog_api
npm install
npm run dev
```

## Troubleshooting

### Build Runner Issues

If you encounter issues with code generation:

```bash
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### iOS Simulator

If the app doesn't launch on iOS simulator:

```bash
cd ios
pod install
cd ..
flutter run
```

## Development

### State Management

This app uses Riverpod for state management. Key providers:
- `authProvider`: Authentication state
- `tripsProvider`: Trip list
- `spotsProvider`: Spots with filters

### API Integration

All API calls go through repositories in `lib/features/*/data/`.

### Adding New Features

1. Create feature folder in `lib/features/`
2. Add data layer (repository)
3. Add providers
4. Add presentation layer (pages/widgets)
5. Update router in `lib/core/utils/app_router.dart`

## License

MIT
