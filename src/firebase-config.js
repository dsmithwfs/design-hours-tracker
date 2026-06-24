// Firebase project configuration
// Steps to fill this in:
//  1. Go to https://console.firebase.google.com
//  2. Create a project (or open an existing one)
//  3. Click the </> Web icon to add a web app
//  4. Copy the firebaseConfig object values below
//  5. In Firebase console: Authentication → Sign-in method → Enable "Email/Password"
//  6. In Firebase console: Firestore Database → Create database (start in production mode)
//  7. In Firestore Rules, paste:
//       rules_version = '2';
//       service cloud.firestore {
//         match /databases/{database}/documents {
//           match /users/{uid}/{document=**} {
//             allow read, write: if request.auth != null && request.auth.uid == uid;
//           }
//         }
//       }

const firebaseConfig = {
  apiKey: "AIzaSyCqelpCOd5EgoRYNs0KTkvANoVLsg6s2wM",
  authDomain: "design-hour-tracker.firebaseapp.com",
  projectId: "design-hour-tracker",
  storageBucket: "design-hour-tracker.firebasestorage.app",
  messagingSenderId: "806680439567",
  appId: "1:806680439567:web:8a494cef006c2ad1722c7a"
};