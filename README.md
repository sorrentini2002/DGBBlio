# 📚 Digital Library - Personal Book Management System

A modern web application for managing your personal library, wishlist, and discovering new books with AI-powered recommendations.

![Digital Library](https://img.shields.io/badge/Project-Digital%20Library-blue.svg)
![Firebase](https://img.shields.io/badge/Firebase-v9.23.0-orange.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)
![HTML5](https://img.shields.io/badge/HTML5-Modern-red.svg)
![CSS3](https://img.shields.io/badge/CSS3-Modern-blue.svg)

## 🌟 Features

### 📖 Library Management
- **Add Books**: Manually add books or import from Google Books API and OpenLibrary
- **Smart Search**: Real-time search with autocomplete suggestions for titles and authors
- **Advanced Filtering**: Filter by author, year, pages, tags, and descriptions
- **Duplicate Prevention**: Automatic detection of duplicate entries
- **Rating & Reviews**: Rate books (1-5 stars) and add personal comments
- **Export Options**: Export your library to CSV or JSON formats

### ⭐ Wishlist Management
- **Priority System**: Set priority levels (Low, Medium, High) for books you want to read
- **Price Tracking**: Track estimated prices for books
- **Personal Notes**: Add notes about why you want to read specific books
- **Smart Transfer**: Move books from wishlist to library with ratings and comments
- **Duplicate Detection**: Prevents adding books already in your library

### 🧠 AI-Powered Quiz System
- **Personalized Recommendations**: Get book recommendations based on your reading preferences
- **Smart Analysis**: Uses Google Gemini AI to analyze your reading patterns
- **Custom Questions**: Dynamic quiz questions based on your existing library
- **Fallback System**: Local recommendation algorithm when AI is unavailable
- **Similar Book Suggestions**: Get suggestions for books similar to recommendations

### 🎨 Modern UI/UX
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Beautiful Gradients**: Modern glassmorphism design with smooth animations
- **Dark Theme Ready**: Elegant color scheme with CSS custom properties
- **Smooth Animations**: Subtle animations and transitions for better user experience
- **Multi-view Options**: Switch between compact and detailed views

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase project with Firestore database
- Google Gemini API key (optional, for AI recommendations)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/digital-library.git
   cd digital-library
   ```

2. **Set up Firebase:**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore Database
   - Get your Firebase configuration
   - Update the Firebase config in `index.html` (lines 1908-1916):
   ```javascript
   const firebaseConfig = {
     apiKey: "your-api-key",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "your-app-id"
   };
   ```

3. **Configure Firestore Security Rules:**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /books/{document} {
         allow read, write: if true;
       }
       match /wishlist/{document} {
         allow read, write: if true;
       }
     }
   }
   ```

4. **Set up Gemini AI (Optional):**
   - Get an API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Update the API key in `app.js` (line 1964):
   ```javascript
   const GEMINI_API_KEY = 'your-gemini-api-key';
   ```

5. **Launch the application:**
   - Simply open `index.html` in your web browser
   - Or serve it using a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using Live Server (VS Code extension)
   Right-click on index.html → "Open with Live Server"
   ```

## 📊 Database Structure

### Books Collection (`books`)
```javascript
{
  title: "Book Title",
  author: "Author Name",
  year: 2023,
  publisher: "Publisher Name",
  pages: 350,
  isbn: "978-1234567890",
  description: "Book description...",
  tags: ["fiction", "mystery"],
  rating: 4, // 1-5 stars
  comment: "Personal review...",
  owner_uid: "anonymous",
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Wishlist Collection (`wishlist`)
```javascript
{
  title: "Book Title",
  author: "Author Name",
  year: 2023,
  publisher: "Publisher Name",
  pages: 350,
  isbn: "978-1234567890",
  description: "Book description...",
  tags: ["fiction", "mystery"],
  priority: 2, // 1=Low, 2=Medium, 3=High
  price: "€15.00",
  notes: "Why I want to read this...",
  owner_uid: "anonymous",
  created_at: Timestamp,
  updated_at: Timestamp
}
```

## 🔧 Configuration

### Firebase Setup
1. Create collections: `books` and `wishlist`
2. Set up security rules (see installation section)
3. Enable Google Books API integration (optional)

### API Configuration
- **Google Books API**: Built-in support, no key required
- **OpenLibrary API**: Built-in support, no key required
- **Gemini AI API**: Requires API key for personalized recommendations

## 🛠️ Development

### Project Structure
```
digital-library/
├── index.html              # Main HTML file with UI and Firebase config
├── app.js                  # Main JavaScript application logic
├── README.md              # This file
└── caricare json su firebase/
    ├── json_to_firebase.html    # JSON import utility
    └── raccolta_libri.json      # Sample book data
```

### Key Components

#### Main Application (`app.js`)
- **Firebase Integration**: Real-time database operations
- **Search & Filtering**: Advanced book filtering and search
- **API Integration**: Google Books and OpenLibrary integration
- **AI Recommendations**: Gemini AI-powered book suggestions
- **Data Management**: CRUD operations for books and wishlist

#### User Interface (`index.html`)
- **Responsive Layout**: Mobile-first design
- **Modern Styling**: CSS custom properties and gradients
- **Component System**: Modular UI components
- **Form Handling**: Dynamic forms with validation

### Adding New Features

1. **New Book Sources**: Add API integrations in the `searchBookData` functions
2. **Custom Filters**: Extend the filtering system in `getFilteredBooks`
3. **Export Formats**: Add new export options in the export functions
4. **UI Themes**: Modify CSS custom properties for new color schemes

## 📱 Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 🎯 Usage Examples

### Adding a Book
1. Click "➕ Aggiungi Libro"
2. Enter title and author
3. Click "🔍 Cerca Automaticamente" for auto-fill
4. Add additional details (rating, tags, comments)
5. Click "Salva Libro"

### Using the Quiz System
1. Navigate to "🧠 Quiz" section
2. Click "🚀 Inizia il Quiz"
3. Answer questions about your reading preferences
4. Get AI-powered book recommendations from your library
5. Rate recommended books or get similar suggestions

### Managing Wishlist
1. Navigate to "⭐ Wishlist" section
2. Add books you want to read
3. Set priority levels and estimated prices
4. Move books to library when read with ratings

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- **Firebase**: For providing excellent real-time database services
- **Google Books API**: For book metadata and cover images
- **OpenLibrary**: For additional book information
- **Google Gemini AI**: For intelligent book recommendations
- **Material Design**: For UI/UX inspiration

## 🐛 Bug Reports & Feature Requests

Please use the [Issues](https://github.com/yourusername/digital-library/issues) section to report bugs or request new features.

## 📊 Stats

- **Languages**: JavaScript (ES6+), HTML5, CSS3
- **Database**: Firebase Firestore
- **APIs**: Google Books API, OpenLibrary API, Google Gemini AI
- **Features**: 20+ major features
- **Mobile Ready**: 100% responsive design

---

**Made with ❤️ for book lovers**
