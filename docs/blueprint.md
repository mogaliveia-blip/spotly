# **App Name**: Eventide Guide

## Core Features:

- User Authentication: Secure user authentication using Firebase Authentication to manage access to the app's features.
- POI Display: Display Points of Interest on an interactive Google Map, allowing users to easily locate and view event highlights.
- POI Reviews: Users can leave reviews, comments, and ratings (1-5 stars) for each POI after visiting.
- POI Management: Authorized editors can create, modify, and delete POI content, including titles, descriptions, header photos, and image galleries.
- Role-Based Access Control: Administer user roles (user, editor, admin) via Firebase custom claims, ensuring that only authorized personnel can manage content and user accounts.
- Admin Interface: Administrators can manage user accounts, search, filter, and modify user roles through a dedicated interface.
- Route suggestion refinement: Refine the route given by Google Maps, based on recent user reviews (crowd sourced preferences). If users reported the official Google Maps route as unsafe recently, the tool recommends alternative, more reliable routes, while also considering up-to-date street closures or unexpected construction.

## Style Guidelines:

- Primary color: Deep violet (#673AB7) for a modern and engaging feel, reflecting the vibrant atmosphere of events.
- Background color: Light gray (#EEEEEE) for a clean, accessible interface.
- Accent color: Bright orange (#FF9800) to draw attention to key interactive elements.
- Body and headline font: 'PT Sans', a modern humanist sans-serif suitable for a variety of UI elements.
- Use simple, intuitive icons to represent POIs and app functionalities, enhancing usability.
- Implement a responsive layout to ensure seamless functionality across devices.
- Subtle transitions and animations to enhance user engagement and provide feedback on interactions.