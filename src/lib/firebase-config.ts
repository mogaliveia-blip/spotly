// src/lib/firebase-config.ts
// La configuration a été mise à jour avec les valeurs correctes pour corriger l'authentification.
export const firebaseConfig = {
  apiKey: "AIzaSyAO_B0ExF-U3KWyYaqsaaH2eaY6v71VhcM",
  authDomain: "studio-9874506289-6647e.firebaseapp.com",
  projectId: "studio-9874506289-6647e",
  storageBucket: "studio-9874506289-6647e.appspot.com",
  messagingSenderId: "418801230120",
  appId: "1:418801230120:web:5493512ed53e23639a701d"
};

export const mapsConfig = {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!,
}
