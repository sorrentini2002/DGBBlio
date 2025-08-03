// Aspetta che Firebase sia stato inizializzato dal modulo
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseAuth && window.firebaseDb && window.firebaseModules) {
            resolve();
        } else {
            setTimeout(() => waitForFirebase().then(resolve), 100);
        }
    });
}

// Inizializza l'app quando Firebase è pronto
waitForFirebase().then(() => {
    console.log("Firebase moderno caricato, inizializzazione index...");
    initApp();
});

function initApp() {
    console.log("🚀 Inizializzazione applicazione...");
    
    // Riferimenti agli oggetti Firebase
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const {
        signInWithPopup,
        signOut,
        GoogleAuthProvider,
        onAuthStateChanged,
        collection,
        doc,
        getDoc,
        setDoc,
        updateDoc,
        deleteDoc,
        getDocs,
        onSnapshot,
        query,
        orderBy
    } = window.firebaseModules;

    console.log("🔥 Controllo connessione Firebase:");
    console.log("- Auth:", !!auth);
    console.log("- Database:", !!db);
    console.log("- Moduli:", !!window.firebaseModules);
    console.log("- DB instance:", db);

    // Test di connessione Firebase
    async function testFirebaseConnection() {
        try {
            console.log("🧪 Test connessione Firebase...");
            const testRef = collection(db, "books");
            console.log("✅ Riferimento collezione 'books' creato con successo:", testRef);
            
            const snapshot = await getDocs(query(testRef));
            console.log("📊 Documenti nella collezione 'books':", snapshot.size);
            
            const wishlistRef = collection(db, "wishlist"); 
            const wishlistSnapshot = await getDocs(query(wishlistRef));
            console.log("📊 Documenti nella collezione 'wishlist':", wishlistSnapshot.size);
            
        } catch (error) {
            console.error("❌ Errore nel test di connessione Firebase:", error);
            console.error("❌ Codice errore:", error.code);
            console.error("❌ Messaggio:", error.message);
        }
    }
    
    // Esegui test di connessione
    testFirebaseConnection();

    // Elementi DOM
    const booksGrid = document.getElementById("booksGrid");
    const searchInput = document.getElementById("searchInput");
    const titleSuggestions = document.getElementById("titleSuggestions");
    const totalBooks = document.getElementById("totalBooks");
    const filteredBooks = document.getElementById("filteredBooks");
    const noResults = document.getElementById("noResults");
    
    // Filtri
    const authorFilter = document.getElementById("authorFilter");
    const authorSuggestions = document.getElementById("authorSuggestions");
    const yearMin = document.getElementById("yearMin");
    const yearMax = document.getElementById("yearMax");
    const pagesMin = document.getElementById("pagesMin");
    const pagesMax = document.getElementById("pagesMax");
    const hasTagsFilter = document.getElementById("hasTagsFilter");
    const hasDescriptionFilter = document.getElementById("hasDescriptionFilter");
    const tagCheckboxes = document.getElementById("tagCheckboxes");
    
    // Ordinamento
    const sortBy = document.getElementById("sortBy");
    const sortAscBtn = document.getElementById("sortAscBtn");
    const sortDescBtn = document.getElementById("sortDescBtn");
    const viewMode = document.getElementById("viewMode");

    // Form
    const addBookForm = document.getElementById("addBookForm");
    const bookForm = document.getElementById("bookForm");

    let editingId = null;
    let allBooks = [];
    let unsubscribeBooks = null;
    let currentSortOrder = 'asc';
    let allAuthors = new Set();
    let allTitles = new Set();
    let allTags = new Set();

    // Avvia l'ascolto dei libri senza autenticazione
    startListeningBooks();

    // ---- Sistema di suggerimenti per titolo ----
    function setupTitleSuggestions() {
        const titleArray = Array.from(allTitles);
        
        searchInput.addEventListener('input', function() {
            const value = this.value.toLowerCase().trim();
            titleSuggestions.innerHTML = '';
            
            if (value.length < 2) {
                titleSuggestions.style.display = 'none';
                return;
            }
            
            // Filtra e ordina titoli simili
            const matches = titleArray
                .filter(title => {
                    const similarity = calculateSimilarity(value, title.toLowerCase());
                    return similarity > 0.3 || title.toLowerCase().includes(value);
                })
                .sort((a, b) => {
                    const simA = calculateSimilarity(value, a.toLowerCase());
                    const simB = calculateSimilarity(value, b.toLowerCase());
                    return simB - simA;
                })
                .slice(0, 8);
            
            if (matches.length > 0) {
                matches.forEach(title => {
                    const div = document.createElement('div');
                    div.textContent = title;
                    div.onclick = () => selectTitle(title);
                    titleSuggestions.appendChild(div);
                });
                titleSuggestions.style.display = 'block';
            } else {
                titleSuggestions.style.display = 'none';
            }
        });
        
        // Nascondi suggerimenti quando clicchi fuori
        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !titleSuggestions.contains(e.target)) {
                titleSuggestions.style.display = 'none';
            }
        });
    }
    
    function selectTitle(title) {
        searchInput.value = title;
        titleSuggestions.style.display = 'none';
        renderBooks();
    }

    // ---- Sistema di suggerimenti per autore ----
    function setupAuthorSuggestions() {
        authorFilter.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (query.length < 2) {
                authorSuggestions.style.display = 'none';
                return;
            }

            // Trova autori che corrispondono alla query
            const matchedAuthors = Array.from(allAuthors).filter(author => 
                author.toLowerCase().includes(query)
            );

            // Se non ci sono corrispondenze esatte, cerca suggerimenti simili
            let suggestedAuthors = matchedAuthors;
            if (matchedAuthors.length === 0) {
                suggestedAuthors = Array.from(allAuthors).filter(author => {
                    return calculateSimilarity(query, author.toLowerCase()) > 0.6;
                }).sort((a, b) => {
                    return calculateSimilarity(query, b.toLowerCase()) - calculateSimilarity(query, a.toLowerCase());
                }).slice(0, 5);
            }

            if (suggestedAuthors.length > 0) {
                authorSuggestions.innerHTML = suggestedAuthors
                    .slice(0, 8) // Mostra max 8 suggerimenti
                    .map(author => `<div onclick="selectAuthor('${escapeHtml(author)}')">${escapeHtml(author)}</div>`)
                    .join('');
                authorSuggestions.style.display = 'block';
            } else {
                authorSuggestions.style.display = 'none';
            }
        });

        // Nascondi suggerimenti quando si clicca fuori
        document.addEventListener('click', (e) => {
            if (!authorFilter.contains(e.target) && !authorSuggestions.contains(e.target)) {
                authorSuggestions.style.display = 'none';
            }
        });
    }

    // Funzione per calcolare la similarità tra due stringhe (algoritmo di Levenshtein semplificato)
    function calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        // Controllo se la stringa più corta è contenuta nella più lunga
        if (longer.includes(shorter)) return 0.8;
        
        // Calcolo distanza di Levenshtein semplificata
        const editDistance = levenshteinDistance(str1, str2);
        return (longer.length - editDistance) / longer.length;
    }

    function levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // Funzione per selezionare un autore dai suggerimenti
    window.selectAuthor = (author) => {
        authorFilter.value = author;
        authorSuggestions.style.display = 'none';
        renderBooks();
    };

    // ---- Ascolto in realtime ----
    function startListeningBooks() {
        if (unsubscribeBooks) unsubscribeBooks();
        
        console.log("🔥 Tentativo di connessione a Firebase per la collezione 'books'...");
        
        try {
            const booksQuery = query(collection(db, "books"), orderBy("created_at", "desc"));
            console.log("📚 Query creata per la collezione books");
            
            unsubscribeBooks = onSnapshot(booksQuery, snapshot => {
                console.log("📡 Snapshot ricevuto dalla collezione books:", snapshot.size, "documenti");
                
                allBooks = [];
                snapshot.forEach(docSnap => {
                    console.log("📖 Documento books trovato:", docSnap.id, docSnap.data());
                    allBooks.push({ id: docSnap.id, ...docSnap.data() });
                });
                
                console.log("📊 Totale libri caricati:", allBooks.length);
                updateFilterOptions();
                renderBooks();
            }, error => {
                console.error("❌ Errore nell'ascolto dei libri:", error);
                console.error("❌ Codice errore:", error.code);
                console.error("❌ Messaggio errore:", error.message);
                booksGrid.innerHTML = `
                    <div class="loading" style="color: red;">
                        ❌ Errore Firebase: ${error.message}<br>
                        Verifica le regole di sicurezza Firestore
                    </div>
                `;
            });
        } catch (error) {
            console.error("❌ Errore nell'inizializzazione dell'ascolto:", error);
            booksGrid.innerHTML = `
                <div class="loading" style="color: red;">
                    ❌ Errore di inizializzazione: ${error.message}
                </div>
            `;
        }
    }

    // ---- Aggiorna opzioni filtri ----
    function updateFilterOptions() {
        // Reset dei set
        allAuthors.clear();
        allTitles.clear();
        allTags.clear();

        // Raccogli tutti i valori unici
        allBooks.forEach(book => {
            if (book.author) allAuthors.add(book.author);
            if (book.title) allTitles.add(book.title);
            if (book.tags && Array.isArray(book.tags)) {
                book.tags.forEach(tag => allTags.add(tag));
            }
        });

        // Aggiorna checkbox tag
        tagCheckboxes.innerHTML = '';
        Array.from(allTags).sort().forEach(tag => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${escapeHtml(tag)}" onchange="renderBooks()"> 
                ${escapeHtml(tag)}
            `;
            tagCheckboxes.appendChild(label);
        });

        // Inizializza i sistemi di suggerimenti
        setupTitleSuggestions();
        setupAuthorSuggestions();
    }

    // ---- Filtri e rendering ----
    function getFilteredBooks() {
        const searchQuery = searchInput.value.toLowerCase();
        const selectedAuthor = authorFilter.value;
        const minYear = parseInt(yearMin.value) || null;
        const maxYear = parseInt(yearMax.value) || null;
        const minPages = parseInt(pagesMin.value) || null;
        const maxPages = parseInt(pagesMax.value) || null;
        const hasTagsOnly = hasTagsFilter.checked;
        const hasDescriptionOnly = hasDescriptionFilter.checked;
        
        // Tag selezionati
        const selectedTags = Array.from(tagCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        return allBooks.filter(book => {
            // Filtro di ricerca testuale (solo titolo)
            if (searchQuery) {
                const titleText = (book.title || '').toLowerCase();
                if (!titleText.includes(searchQuery)) return false;
            }

            // Filtro autore
            if (selectedAuthor && book.author !== selectedAuthor) return false;

            // Filtro range anni
            if (minYear && book.year && book.year < minYear) return false;
            if (maxYear && book.year && book.year > maxYear) return false;

            // Filtro range pagine  
            if (minPages && book.pages && book.pages < minPages) return false;
            if (maxPages && book.pages && book.pages > maxPages) return false;

            // Filtro "solo con tag"
            if (hasTagsOnly && (!book.tags || book.tags.length === 0)) return false;

            // Filtro "solo con descrizione"
            if (hasDescriptionOnly && !book.description) return false;

            // Filtro tag selezionati
            if (selectedTags.length > 0) {
                const bookTags = book.tags || [];
                const hasSelectedTag = selectedTags.some(tag => bookTags.includes(tag));
                if (!hasSelectedTag) return false;
            }

            return true;
        });
    }

    function renderBooks() {
        const filtered = getFilteredBooks();
        
        // Ordinamento
        const sortField = sortBy.value;
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            // Gestione speciale per autore (ordina per cognome)
            if (sortField === 'author') {
                aVal = getLastName(a.author || '');
                bVal = getLastName(b.author || '');
            } else {
                aVal = a[sortField] || '';
                bVal = b[sortField] || '';
            }
            
            // Gestione per valori numerici (anno, pagine)
            if (sortField === 'year' || sortField === 'pages') {
                aVal = parseInt(aVal) || 0;
                bVal = parseInt(bVal) || 0;
                return currentSortOrder === 'asc' ? 
                    (aVal - bVal) : 
                    (bVal - aVal);
            }
            
            // Gestione per stringhe
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return currentSortOrder === 'asc' ? 
                    aVal.localeCompare(bVal) : 
                    bVal.localeCompare(aVal);
            }
            
            return currentSortOrder === 'asc' ? 
                (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) :
                (bVal < aVal ? -1 : bVal > aVal ? 1 : 0);
        });

        // Aggiorna statistiche
        totalBooks.textContent = `Totale: ${allBooks.length} libri`;
        if (filtered.length !== allBooks.length) {
            filteredBooks.textContent = `Filtrati: ${filtered.length} libri`;
            filteredBooks.classList.remove('hidden');
        } else {
            filteredBooks.textContent = '';
            filteredBooks.classList.add('hidden');
        }

        // Rendering
        booksGrid.innerHTML = '';
        
        if (filtered.length === 0) {
            noResults.style.display = 'block';
            return;
        }
        
        noResults.style.display = 'none';
        
        const isDetailed = viewMode.value === 'detailed';
        
        filtered.forEach(book => {
            const bookCard = document.createElement('div');
            bookCard.className = 'book-card';
            
            const tagsHtml = (book.tags || []).map(tag => 
                `<span class="tag">${escapeHtml(tag)}</span>`
            ).join('');
            
            // Vista compatta: solo titolo, autore e tag
            if (!isDetailed) {
                const ratingHtml = book.rating ? `<div class="rating" style="margin-top: 0.5rem;">⭐ ${book.rating}/5</div>` : '';
                
                bookCard.innerHTML = `
                    <h3>${escapeHtml(book.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(book.author || 'Autore sconosciuto')}</div>
                    ${ratingHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 1rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem;">
                        <button onclick="editBook('${book.id}')" class="btn-secondary">Modifica</button>
                        <button onclick="deleteBook('${book.id}')" class="btn-danger" style="margin-left: 0.5rem;" title="Elimina libro">🗑️ Elimina</button>
                    </div>
                `;
            } 
            // Vista dettagliata: tutte le info tranne le date
            else {
                let additionalInfo = [];
                if (book.publisher) additionalInfo.push(`Editore: ${escapeHtml(book.publisher)}`);
                if (book.pages) additionalInfo.push(`${book.pages} pagine`);
                if (book.isbn) additionalInfo.push(`ISBN: ${escapeHtml(book.isbn)}`);
                
                const ratingHtml = book.rating ? `<div class="rating" style="margin-top: 0.5rem; font-weight: 600; color: var(--accent-color);">⭐ Voto: ${book.rating}/5</div>` : '';
                const commentHtml = book.comment ? `<div class="comment" style="margin-top: 0.5rem; font-style: italic; color: var(--text-secondary); background: rgba(255,255,255,0.5); padding: 0.5rem; border-radius: 8px;"><strong>Commento:</strong> ${escapeHtml(book.comment)}</div>` : '';
                
                bookCard.innerHTML = `
                    <h3>${escapeHtml(book.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(book.author || 'Autore sconosciuto')}</div>
                    <div class="year">${book.year || 'Anno non specificato'}</div>
                    ${ratingHtml}
                    ${additionalInfo.length > 0 ? `<div class="small" style="margin-top: 0.5rem;">${additionalInfo.join(' • ')}</div>` : ''}
                    ${book.description ? `<div class="small" style="margin-top: 0.5rem; font-style: italic;">${escapeHtml(book.description.substring(0, 200))}${book.description.length > 200 ? '...' : ''}</div>` : ''}
                    ${commentHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 0.5rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem;">
                        <button onclick="editBook('${book.id}')" class="btn-secondary">Modifica</button>
                        <button onclick="deleteBook('${book.id}')" class="btn-danger" style="margin-left: 0.5rem;" title="Elimina libro">🗑️ Elimina</button>
                    </div>
                `;
            }
            
            booksGrid.appendChild(bookCard);
        });
    }

    // ---- Event listeners ----
    searchInput.addEventListener('input', renderBooks);
    authorFilter.addEventListener('input', renderBooks);
    yearMin.addEventListener('input', renderBooks);
    yearMax.addEventListener('input', renderBooks);
    pagesMin.addEventListener('input', renderBooks);
    pagesMax.addEventListener('input', renderBooks);
    hasTagsFilter.addEventListener('change', renderBooks);
    hasDescriptionFilter.addEventListener('change', renderBooks);
    sortBy.addEventListener('change', renderBooks);
    viewMode.addEventListener('change', renderBooks);

    // ---- Ordinamento ----
    window.setSortOrder = (order) => {
        currentSortOrder = order;
        sortAscBtn.classList.toggle('active', order === 'asc');
        sortDescBtn.classList.toggle('active', order === 'desc');
        renderBooks();
    };

    // ---- Gestione form ----
    window.toggleAddBookForm = () => {
        addBookForm.style.display = addBookForm.style.display === 'none' ? 'block' : 'none';
        if (addBookForm.style.display === 'block') {
            clearBookForm();
        }
    };

    window.clearBookForm = () => {
        bookForm.reset();
        editingId = null;
        document.getElementById('searchResults').style.display = 'none';
    };

    // ---- Ricerca automatica libri ----
    window.searchBookData = async () => {
        const title = document.getElementById('bookTitle').value.trim();
        const author = document.getElementById('bookAuthor').value.trim();
        
        if (!title || !author) {
            alert('Inserisci titolo e autore per cercare automaticamente');
            return;
        }
        
        // Controlla duplicati prima di cercare
        if (!editingId) {
            const isDuplicate = allBooks.some(book => 
                book.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === author.toLowerCase().trim()
            );
            
            if (isDuplicate) {
                const searchResults = document.getElementById('searchResults');
                searchResults.innerHTML = `
                    <div class="manual-message">
                        <h4>⚠️ Libro già presente</h4>
                        <p>Il libro "<strong>${title}</strong>" di <strong>${author}</strong> è già presente nella tua biblioteca.</p>
                        <p>Non è possibile aggiungere duplicati.</p>
                    </div>
                `;
                searchResults.style.display = 'block';
                return;
            }
        }
        
        const searchResults = document.getElementById('searchResults');
        searchResults.style.display = 'block';
        searchResults.innerHTML = '<div class="loading-search">🔍 Cercando informazioni sul libro...</div>';
        
        try {
            // Cerca prima con Google Books API
            const googleResults = await searchGoogleBooks(title, author);
            // Poi cerca con OpenLibrary API
            const openLibraryResults = await searchOpenLibrary(title, author);
            
            const allResults = [...googleResults, ...openLibraryResults];
            
            if (allResults.length > 0) {
                displaySearchResults(allResults);
            } else {
                searchResults.innerHTML = `
                    <div class="manual-message">
                        <h4>📖 Nessun risultato trovato</h4>
                        <p>Non sono riuscito a trovare informazioni automatiche per questo libro.</p>
                        <p>Compila manualmente i campi sottostanti.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Errore nella ricerca:', error);
            searchResults.innerHTML = `
                <div class="manual-message">
                    <h4>⚠️ Errore nella ricerca</h4>
                    <p>Si è verificato un errore durante la ricerca automatica.</p>
                    <p>Compila manualmente i campi.</p>
                </div>
            `;
        }
    };
    
    async function searchGoogleBooks(title, author) {
        try {
            const query = encodeURIComponent(`${title} ${author}`);
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`);
            const data = await response.json();
            
            if (!data.items) return [];
            
            return data.items.map(item => {
                const volumeInfo = item.volumeInfo;
                return {
                    source: 'Google Books',
                    title: volumeInfo.title || '',
                    author: volumeInfo.authors ? volumeInfo.authors.join(', ') : '',
                    year: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : null,
                    publisher: volumeInfo.publisher || '',
                    pages: volumeInfo.pageCount || null,
                    isbn: volumeInfo.industryIdentifiers ? 
                        volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_13')?.identifier ||
                        volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_10')?.identifier || '' : '',
                    description: volumeInfo.description || '',
                    categories: volumeInfo.categories || []
                };
            });
        } catch (error) {
            console.error('Errore Google Books:', error);
            return [];
        }
    }
    
    async function searchOpenLibrary(title, author) {
        try {
            const query = encodeURIComponent(`${title} ${author}`);
            const response = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=3`);
            const data = await response.json();
            
            if (!data.docs) return [];
            
            return data.docs.map(doc => ({
                source: 'Open Library',
                title: doc.title || '',
                author: doc.author_name ? doc.author_name.join(', ') : '',
                year: doc.first_publish_year || null,
                publisher: doc.publisher ? doc.publisher[0] : '',
                pages: doc.number_of_pages_median || null,
                isbn: doc.isbn ? doc.isbn[0] : '',
                description: '',
                categories: doc.subject ? doc.subject.slice(0, 5) : []
            }));
        } catch (error) {
            console.error('Errore Open Library:', error);
            return [];
        }
    }
    
    function displaySearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        let html = '<h4 style="margin-bottom: 1rem;">📚 Risultati trovati - Clicca per selezionare:</h4>';
        
        results.forEach((result, index) => {
            html += `
                <div class="api-result" onclick="selectBookData(${index})">
                    <h4>${result.title}</h4>
                    <p><strong>Autore:</strong> ${result.author}</p>
                    ${result.year ? `<p><strong>Anno:</strong> ${result.year}</p>` : ''}
                    ${result.publisher ? `<p><strong>Editore:</strong> ${result.publisher}</p>` : ''}
                    ${result.pages ? `<p><strong>Pagine:</strong> ${result.pages}</p>` : ''}
                    ${result.isbn ? `<p><strong>ISBN:</strong> ${result.isbn}</p>` : ''}
                    <p><small><strong>Fonte:</strong> ${result.source}</small></p>
                </div>
            `;
        });
        
        searchResults.innerHTML = html;
        // Salva i risultati per la selezione
        window.currentSearchResults = results;
    }
    
    window.selectBookData = (index) => {
        const result = window.currentSearchResults[index];
        if (!result) return;
        
        // Compila i campi del form
        document.getElementById('bookTitle').value = result.title;
        document.getElementById('bookAuthor').value = result.author;
        if (result.year) document.getElementById('bookYear').value = result.year;
        if (result.publisher) document.getElementById('bookPublisher').value = result.publisher;
        if (result.pages) document.getElementById('bookPages').value = result.pages;
        if (result.isbn) document.getElementById('bookIsbn').value = result.isbn;
        if (result.description) document.getElementById('bookDescription').value = result.description;
        
        // Aggiungi le categorie come tag se disponibili
        if (result.categories && result.categories.length > 0) {
            const currentTags = document.getElementById('bookTags').value;
            const newTags = result.categories.slice(0, 3).join(', ');
            document.getElementById('bookTags').value = currentTags ? `${currentTags}, ${newTags}` : newTags;
        }
        
        // Nascondi i risultati
        document.getElementById('searchResults').style.display = 'none';
        
        // Messaggio di conferma
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = `
            <div class="api-result">
                <h4>✅ Dati importati con successo!</h4>
                <p>I campi sono stati compilati automaticamente. Puoi modificarli se necessario.</p>
            </div>
        `;
        searchResults.style.display = 'block';
        
        setTimeout(() => {
            searchResults.style.display = 'none';
        }, 3000);
    };

    window.addNewBook = async (event) => {
        event.preventDefault();
        
        const bookData = {
            title: document.getElementById('bookTitle').value.trim(),
            author: document.getElementById('bookAuthor').value.trim(),
            year: parseInt(document.getElementById('bookYear').value) || null,
            publisher: document.getElementById('bookPublisher').value.trim() || null,
            pages: parseInt(document.getElementById('bookPages').value) || null,
            isbn: document.getElementById('bookIsbn').value.trim() || null,
            description: document.getElementById('bookDescription').value.trim() || null,
            tags: document.getElementById('bookTags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t),
            rating: parseInt(document.getElementById('bookRating').value) || null,
            comment: document.getElementById('bookComment').value.trim() || null,
            owner_uid: 'anonymous', // Sempre anonimo senza autenticazione
            updated_at: new Date()
        };

        if (!bookData.title || !bookData.author) {
            alert('Titolo e autore sono obbligatori');
            return;
        }

        // Controllo duplicati solo per nuovi libri (non per modifiche)
        if (!editingId) {
            const isDuplicate = allBooks.some(book => 
                book.title.toLowerCase().trim() === bookData.title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === bookData.author.toLowerCase().trim()
            );
            
            if (isDuplicate) {
                alert(`⚠️ LIBRO GIÀ PRESENTE\n\nIl libro "${bookData.title}" di ${bookData.author} è già presente nella tua biblioteca.\n\nNon è possibile aggiungere duplicati.`);
                return;
            }
        }

        try {
            console.log("💾 Tentativo di salvataggio libro su Firebase...", bookData);
            
            if (editingId) {
                console.log("📝 Aggiornamento libro esistente con ID:", editingId);
                await updateDoc(doc(db, "books", editingId), bookData);
                console.log("✅ Libro aggiornato con successo!");
                alert('Libro aggiornato con successo!');
            } else {
                bookData.created_at = new Date();
                const docId = Date.now().toString();
                console.log("🆕 Aggiunta nuovo libro con ID:", docId, bookData);
                await setDoc(doc(db, "books", docId), bookData);
                console.log("✅ Libro salvato con successo su Firebase!");
                alert('✅ Libro aggiunto con successo alla tua biblioteca!');
            }
            
            toggleAddBookForm();
            clearBookForm();
        } catch (error) {
            console.error("❌ Errore nel salvare il libro:", error);
            console.error("❌ Dettagli errore:", error.code, error.message);
            alert("Errore nel salvare il libro: " + error.message);
        }
    };

    window.editBook = (id) => {
        const book = allBooks.find(b => b.id === id);
        if (!book) return;

        editingId = id;
        document.getElementById('bookTitle').value = book.title || '';
        document.getElementById('bookAuthor').value = book.author || '';
        document.getElementById('bookYear').value = book.year || '';
        document.getElementById('bookPublisher').value = book.publisher || '';
        document.getElementById('bookPages').value = book.pages || '';
        document.getElementById('bookIsbn').value = book.isbn || '';
        document.getElementById('bookDescription').value = book.description || '';
        document.getElementById('bookTags').value = (book.tags || []).join(', ');
        document.getElementById('bookRating').value = book.rating || '';
        document.getElementById('bookComment').value = book.comment || '';
        
        // Nascondi i risultati di ricerca quando si modifica
        document.getElementById('searchResults').style.display = 'none';
        
        addBookForm.style.display = 'block';
    };

    // ---- Cancellazione libro ----
    window.deleteBook = async (id) => {
        const book = allBooks.find(b => b.id === id);
        if (!book) {
            alert('Libro non trovato');
            return;
        }

        const confirmMessage = `🗑️ ELIMINA LIBRO\n\nSei sicuro di voler eliminare definitivamente questo libro?\n\n📖 "${book.title}"\n✍️ di ${book.author}\n\n⚠️ Questa operazione non può essere annullata!`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            console.log("🗑️ Tentativo di eliminazione libro:", id, book.title);
            await deleteDoc(doc(db, "books", id));
            console.log("✅ Libro eliminato con successo!");
            alert('✅ Libro eliminato con successo!');
        } catch (error) {
            console.error("❌ Errore nell'eliminazione del libro:", error);
            console.error("❌ Dettagli errore:", error.code, error.message);
            alert(`❌ Errore nell'eliminazione del libro: ${error.message}`);
        }
    };

    // ---- Utility per filtri ----
    window.clearAllFilters = () => {
        searchInput.value = '';
        authorFilter.value = '';
        yearMin.value = '';
        yearMax.value = '';
        pagesMin.value = '';
        pagesMax.value = '';
        hasTagsFilter.checked = false;
        hasDescriptionFilter.checked = false;
        
        // Nascondi dropdown suggerimenti
        titleSuggestions.style.display = 'none';
        authorSuggestions.style.display = 'none';
        
        // Deseleziona tutti i tag
        tagCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        renderBooks();
    };

    // ---- Utility ----
    function getLastName(fullName) {
        if (!fullName) return '';
        const nameParts = fullName.trim().split(/\s+/);
        return nameParts[nameParts.length - 1].toLowerCase();
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, s => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[s]));
    }
    
    // ---- Controllo duplicati in tempo reale ----
    function setupDuplicateCheck() {
        const titleInput = document.getElementById('bookTitle');
        const authorInput = document.getElementById('bookAuthor');
        
        if (!titleInput || !authorInput) return;
        
        function checkDuplicatesRealTime() {
            if (editingId) return; // Non controllare se stiamo modificando
            
            const title = titleInput.value.trim();
            const author = authorInput.value.trim();
            
            if (title && author) {
                const isDuplicate = allBooks.some(book => 
                    book.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                    book.author.toLowerCase().trim() === author.toLowerCase().trim()
                );
                
                const duplicateWarning = document.getElementById('duplicateWarning');
                if (isDuplicate) {
                    if (!duplicateWarning) {
                        const warning = document.createElement('div');
                        warning.id = 'duplicateWarning';
                        warning.className = 'duplicate-warning';
                        warning.innerHTML = '⚠️ Questo libro è già presente nella tua biblioteca';
                        authorInput.parentNode.insertBefore(warning, authorInput.nextSibling);
                    }
                } else {
                    if (duplicateWarning) {
                        duplicateWarning.remove();
                    }
                }
            } else {
                const duplicateWarning = document.getElementById('duplicateWarning');
                if (duplicateWarning) {
                    duplicateWarning.remove();
                }
            }
        }
        
        titleInput.addEventListener('input', checkDuplicatesRealTime);
        authorInput.addEventListener('input', checkDuplicatesRealTime);
    }
    
    // Inizializza il controllo duplicati quando i campi sono disponibili
    setTimeout(setupDuplicateCheck, 500);
    
    // ===== SEZIONE WISHLIST =====
    
    // Variabili per la wishlist
    let editingWishlistId = null;
    let allWishlistItems = [];
    let unsubscribeWishlist = null;
    let currentWishlistSortOrder = 'desc'; // Ordinamento per priorità decrescente di default
    let allWishlistAuthors = new Set();
    let allWishlistTitles = new Set();
    let allWishlistTags = new Set();
    
    // Elementi DOM per la wishlist
    const wishlistGrid = document.getElementById("wishlistGrid");
    const wishlistSearchInput = document.getElementById("wishlistSearchInput");
    const wishlistTitleSuggestions = document.getElementById("wishlistTitleSuggestions");
    const totalWishlist = document.getElementById("totalWishlist");
    const filteredWishlist = document.getElementById("filteredWishlist");
    const wishlistNoResults = document.getElementById("wishlistNoResults");
    
    // Filtri wishlist
    const wishlistAuthorFilter = document.getElementById("wishlistAuthorFilter");
    const wishlistAuthorSuggestions = document.getElementById("wishlistAuthorSuggestions");
    const wishlistYearMin = document.getElementById("wishlistYearMin");
    const wishlistYearMax = document.getElementById("wishlistYearMax");
    const wishlistPagesMin = document.getElementById("wishlistPagesMin");
    const wishlistPagesMax = document.getElementById("wishlistPagesMax");
    const wishlistHasTagsFilter = document.getElementById("wishlistHasTagsFilter");
    const wishlistHasDescriptionFilter = document.getElementById("wishlistHasDescriptionFilter");
    const wishlistPriorityFilter = document.getElementById("wishlistPriorityFilter");
    const wishlistTagCheckboxes = document.getElementById("wishlistTagCheckboxes");
    
    // Ordinamento wishlist
    const wishlistSortBy = document.getElementById("wishlistSortBy");
    const wishlistSortAscBtn = document.getElementById("wishlistSortAscBtn");
    const wishlistSortDescBtn = document.getElementById("wishlistSortDescBtn");
    const wishlistViewMode = document.getElementById("wishlistViewMode");

    // Form wishlist
    const addWishlistForm = document.getElementById("addWishlistForm");
    const wishlistForm = document.getElementById("wishlistForm");
    
    // ---- Gestione sezioni ----
    window.showSection = (section) => {
        const booksSection = document.getElementById('booksSection');
        const wishlistSection = document.getElementById('wishlistSection');
        const quizSection = document.getElementById('quizSection');
        const booksTabBtn = document.getElementById('booksTabBtn');
        const wishlistTabBtn = document.getElementById('wishlistTabBtn');
        const quizTabBtn = document.getElementById('quizTabBtn');
        
        // Nascondi tutte le sezioni
        booksSection.style.display = 'none';
        wishlistSection.style.display = 'none';
        quizSection.style.display = 'none';
        
        // Rimuovi active da tutti i pulsanti
        booksTabBtn.classList.remove('active');
        wishlistTabBtn.classList.remove('active');
        quizTabBtn.classList.remove('active');
        
        if (section === 'books') {
            booksSection.style.display = 'block';
            booksTabBtn.classList.add('active');
        } else if (section === 'wishlist') {
            wishlistSection.style.display = 'block';
            wishlistTabBtn.classList.add('active');
            
            // Avvia l'ascolto della wishlist quando si entra nella sezione
            if (!unsubscribeWishlist) {
                startListeningWishlist();
            }
        } else if (section === 'quiz') {
            quizSection.style.display = 'block';
            quizTabBtn.classList.add('active');
        }
    };
    
    // ---- Ascolto wishlist in realtime ----
    function startListeningWishlist() {
        if (unsubscribeWishlist) unsubscribeWishlist();
        
        console.log("🔥 Tentativo di connessione a Firebase per la collezione 'wishlist'...");
        
        try {
            const wishlistQuery = query(collection(db, "wishlist"), orderBy("created_at", "desc"));
            console.log("⭐ Query creata per la collezione wishlist");
            
            unsubscribeWishlist = onSnapshot(wishlistQuery, snapshot => {
                console.log("📡 Snapshot ricevuto dalla collezione wishlist:", snapshot.size, "documenti");
                
                allWishlistItems = [];
                snapshot.forEach(docSnap => {
                    console.log("⭐ Documento wishlist trovato:", docSnap.id, docSnap.data());
                    allWishlistItems.push({ id: docSnap.id, ...docSnap.data() });
                });
                
                console.log("📊 Totale libri wishlist caricati:", allWishlistItems.length);
                updateWishlistFilterOptions();
                renderWishlist();
            }, error => {
                console.error("❌ Errore nell'ascolto della wishlist:", error);
                console.error("❌ Codice errore:", error.code);
                console.error("❌ Messaggio errore:", error.message);
                wishlistGrid.innerHTML = `
                    <div class="loading" style="color: red;">
                        ❌ Errore Firebase: ${error.message}<br>
                        Verifica le regole di sicurezza Firestore
                    </div>
                `;
            });
        } catch (error) {
            console.error("❌ Errore nell'inizializzazione dell'ascolto wishlist:", error);
            wishlistGrid.innerHTML = `
                <div class="loading" style="color: red;">
                    ❌ Errore di inizializzazione: ${error.message}
                </div>
            `;
        }
    }
    
    // ---- Sistema di suggerimenti wishlist ----
    function setupWishlistTitleSuggestions() {
        const titleArray = Array.from(allWishlistTitles);
        
        wishlistSearchInput.addEventListener('input', function() {
            const value = this.value.toLowerCase().trim();
            wishlistTitleSuggestions.innerHTML = '';
            
            if (value.length < 2) {
                wishlistTitleSuggestions.style.display = 'none';
                return;
            }
            
            const matches = titleArray
                .filter(title => {
                    const similarity = calculateSimilarity(value, title.toLowerCase());
                    return similarity > 0.3 || title.toLowerCase().includes(value);
                })
                .sort((a, b) => {
                    const simA = calculateSimilarity(value, a.toLowerCase());
                    const simB = calculateSimilarity(value, b.toLowerCase());
                    return simB - simA;
                })
                .slice(0, 8);
            
            if (matches.length > 0) {
                matches.forEach(title => {
                    const div = document.createElement('div');
                    div.textContent = title;
                    div.onclick = () => selectWishlistTitle(title);
                    wishlistTitleSuggestions.appendChild(div);
                });
                wishlistTitleSuggestions.style.display = 'block';
            } else {
                wishlistTitleSuggestions.style.display = 'none';
            }
        });
        
        document.addEventListener('click', function(e) {
            if (!wishlistSearchInput.contains(e.target) && !wishlistTitleSuggestions.contains(e.target)) {
                wishlistTitleSuggestions.style.display = 'none';
            }
        });
    }
    
    function selectWishlistTitle(title) {
        wishlistSearchInput.value = title;
        wishlistTitleSuggestions.style.display = 'none';
        renderWishlist();
    }

    function setupWishlistAuthorSuggestions() {
        wishlistAuthorFilter.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (query.length < 2) {
                wishlistAuthorSuggestions.style.display = 'none';
                return;
            }

            const matchedAuthors = Array.from(allWishlistAuthors).filter(author => 
                author.toLowerCase().includes(query)
            );

            let suggestedAuthors = matchedAuthors;
            if (matchedAuthors.length === 0) {
                suggestedAuthors = Array.from(allWishlistAuthors).filter(author => {
                    return calculateSimilarity(query, author.toLowerCase()) > 0.6;
                }).sort((a, b) => {
                    return calculateSimilarity(query, b.toLowerCase()) - calculateSimilarity(query, a.toLowerCase());
                }).slice(0, 5);
            }

            if (suggestedAuthors.length > 0) {
                wishlistAuthorSuggestions.innerHTML = suggestedAuthors
                    .slice(0, 8)
                    .map(author => `<div onclick="selectWishlistAuthor('${escapeHtml(author)}')">${escapeHtml(author)}</div>`)
                    .join('');
                wishlistAuthorSuggestions.style.display = 'block';
            } else {
                wishlistAuthorSuggestions.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!wishlistAuthorFilter.contains(e.target) && !wishlistAuthorSuggestions.contains(e.target)) {
                wishlistAuthorSuggestions.style.display = 'none';
            }
        });
    }

    window.selectWishlistAuthor = (author) => {
        wishlistAuthorFilter.value = author;
        wishlistAuthorSuggestions.style.display = 'none';
        renderWishlist();
    };
    
    // ---- Aggiorna opzioni filtri wishlist ----
    function updateWishlistFilterOptions() {
        allWishlistAuthors.clear();
        allWishlistTitles.clear();
        allWishlistTags.clear();

        allWishlistItems.forEach(item => {
            if (item.author) allWishlistAuthors.add(item.author);
            if (item.title) allWishlistTitles.add(item.title);
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => allWishlistTags.add(tag));
            }
        });

        // Aggiorna checkbox tag
        wishlistTagCheckboxes.innerHTML = '';
        Array.from(allWishlistTags).sort().forEach(tag => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${escapeHtml(tag)}" onchange="renderWishlist()"> 
                ${escapeHtml(tag)}
            `;
            wishlistTagCheckboxes.appendChild(label);
        });

        setupWishlistTitleSuggestions();
        setupWishlistAuthorSuggestions();
    }

    // ---- Filtri e rendering wishlist ----
    function getFilteredWishlistItems() {
        const searchQuery = wishlistSearchInput.value.toLowerCase();
        const selectedAuthor = wishlistAuthorFilter.value;
        const minYear = parseInt(wishlistYearMin.value) || null;
        const maxYear = parseInt(wishlistYearMax.value) || null;
        const minPages = parseInt(wishlistPagesMin.value) || null;
        const maxPages = parseInt(wishlistPagesMax.value) || null;
        const hasTagsOnly = wishlistHasTagsFilter.checked;
        const hasDescriptionOnly = wishlistHasDescriptionFilter.checked;
        const selectedPriority = wishlistPriorityFilter.value;
        
        const selectedTags = Array.from(wishlistTagCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        return allWishlistItems.filter(item => {
            // Filtro di ricerca testuale (solo titolo)
            if (searchQuery) {
                const titleText = (item.title || '').toLowerCase();
                if (!titleText.includes(searchQuery)) return false;
            }

            // Filtro autore
            if (selectedAuthor && item.author !== selectedAuthor) return false;

            // Filtro range anni
            if (minYear && item.year && item.year < minYear) return false;
            if (maxYear && item.year && item.year > maxYear) return false;

            // Filtro range pagine  
            if (minPages && item.pages && item.pages < minPages) return false;
            if (maxPages && item.pages && item.pages > maxPages) return false;

            // Filtro "solo con tag"
            if (hasTagsOnly && (!item.tags || item.tags.length === 0)) return false;

            // Filtro "solo con descrizione"
            if (hasDescriptionOnly && !item.description) return false;

            // Filtro priorità
            if (selectedPriority && item.priority != selectedPriority) return false;

            // Filtro tag selezionati
            if (selectedTags.length > 0) {
                const itemTags = item.tags || [];
                const hasSelectedTag = selectedTags.some(tag => itemTags.includes(tag));
                if (!hasSelectedTag) return false;
            }

            return true;
        });
    }

    function renderWishlist() {
        const filtered = getFilteredWishlistItems();
        
        // Ordinamento
        const sortField = wishlistSortBy.value;
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            if (sortField === 'author') {
                aVal = getLastName(a.author || '');
                bVal = getLastName(b.author || '');
            } else if (sortField === 'priority') {
                // Per priorità: 3=Alta, 2=Media, 1=Bassa
                aVal = parseInt(a.priority) || 2;
                bVal = parseInt(b.priority) || 2;
            } else {
                aVal = a[sortField] || '';
                bVal = b[sortField] || '';
            }
            
            if (sortField === 'year' || sortField === 'pages' || sortField === 'priority') {
                aVal = parseInt(aVal) || 0;
                bVal = parseInt(bVal) || 0;
                return currentWishlistSortOrder === 'asc' ? 
                    (aVal - bVal) : 
                    (bVal - aVal);
            }
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return currentWishlistSortOrder === 'asc' ? 
                    aVal.localeCompare(bVal) : 
                    bVal.localeCompare(aVal);
            }
            
            return currentWishlistSortOrder === 'asc' ? 
                (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) :
                (bVal < aVal ? -1 : bVal > aVal ? 1 : 0);
        });

        // Aggiorna statistiche
        totalWishlist.textContent = `Totale: ${allWishlistItems.length} libri`;
        if (filtered.length !== allWishlistItems.length) {
            filteredWishlist.textContent = `Filtrati: ${filtered.length} libri`;
            filteredWishlist.classList.remove('hidden');
        } else {
            filteredWishlist.textContent = '';
            filteredWishlist.classList.add('hidden');
        }

        // Rendering
        wishlistGrid.innerHTML = '';
        
        if (filtered.length === 0) {
            wishlistNoResults.style.display = 'block';
            return;
        }
        
        wishlistNoResults.style.display = 'none';
        
        const isDetailed = wishlistViewMode.value === 'detailed';
        
        filtered.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'book-card wishlist-card';
            
            const tagsHtml = (item.tags || []).map(tag => 
                `<span class="tag">${escapeHtml(tag)}</span>`
            ).join('');
            
            const priorityStars = {
                1: '⭐ Bassa',
                2: '⭐⭐ Media', 
                3: '⭐⭐⭐ Alta'
            };
            const priorityHtml = `<div class="priority priority-${item.priority || 2}">${priorityStars[item.priority || 2]}</div>`;
            
            // Vista compatta
            if (!isDetailed) {
                const priceHtml = item.price ? `<div class="price" style="margin-top: 0.5rem; font-weight: 600; color: var(--accent-color);">💰 ${escapeHtml(item.price)}</div>` : '';
                
                itemCard.innerHTML = `
                    <h3>${escapeHtml(item.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(item.author || 'Autore sconosciuto')}</div>
                    ${priorityHtml}
                    ${priceHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 1rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem;">
                        <button onclick="editWishlistItem('${item.id}')" class="btn-secondary">Modifica</button>
                        <button onclick="moveToLibrary('${item.id}')" class="btn-primary" title="Sposta nei libri letti">📚 Letto!</button>
                        <button onclick="deleteWishlistItem('${item.id}')" class="btn-danger" style="margin-left: 0.5rem;" title="Elimina dalla wishlist">🗑️ Elimina</button>
                    </div>
                `;
            } 
            // Vista dettagliata
            else {
                let additionalInfo = [];
                if (item.publisher) additionalInfo.push(`Editore: ${escapeHtml(item.publisher)}`);
                if (item.pages) additionalInfo.push(`${item.pages} pagine`);
                if (item.isbn) additionalInfo.push(`ISBN: ${escapeHtml(item.isbn)}`);
                
                const priceHtml = item.price ? `<div class="price" style="margin-top: 0.5rem; font-weight: 600; color: var(--accent-color);">💰 Prezzo stimato: ${escapeHtml(item.price)}</div>` : '';
                const notesHtml = item.notes ? `<div class="notes" style="margin-top: 0.5rem; font-style: italic; color: var(--text-secondary); background: rgba(255,255,255,0.5); padding: 0.5rem; border-radius: 8px;"><strong>Note:</strong> ${escapeHtml(item.notes)}</div>` : '';
                
                itemCard.innerHTML = `
                    <h3>${escapeHtml(item.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(item.author || 'Autore sconosciuto')}</div>
                    <div class="year">${item.year || 'Anno non specificato'}</div>
                    ${priorityHtml}
                    ${priceHtml}
                    ${additionalInfo.length > 0 ? `<div class="small" style="margin-top: 0.5rem;">${additionalInfo.join(' • ')}</div>` : ''}
                    ${item.description ? `<div class="small" style="margin-top: 0.5rem; font-style: italic;">${escapeHtml(item.description.substring(0, 200))}${item.description.length > 200 ? '...' : ''}</div>` : ''}
                    ${notesHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 0.5rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem;">
                        <button onclick="editWishlistItem('${item.id}')" class="btn-secondary">Modifica</button>
                        <button onclick="moveToLibrary('${item.id}')" class="btn-primary" title="Sposta nei libri letti">📚 Letto!</button>
                        <button onclick="deleteWishlistItem('${item.id}')" class="btn-danger" style="margin-left: 0.5rem;" title="Elimina dalla wishlist">🗑️ Elimina</button>
                    </div>
                `;
            }
            
            wishlistGrid.appendChild(itemCard);
        });
    }
    
    // ---- Event listeners wishlist ----
    wishlistSearchInput.addEventListener('input', renderWishlist);
    wishlistAuthorFilter.addEventListener('input', renderWishlist);
    wishlistYearMin.addEventListener('input', renderWishlist);
    wishlistYearMax.addEventListener('input', renderWishlist);
    wishlistPagesMin.addEventListener('input', renderWishlist);
    wishlistPagesMax.addEventListener('input', renderWishlist);
    wishlistHasTagsFilter.addEventListener('change', renderWishlist);
    wishlistHasDescriptionFilter.addEventListener('change', renderWishlist);
    wishlistPriorityFilter.addEventListener('change', renderWishlist);
    wishlistSortBy.addEventListener('change', renderWishlist);
    wishlistViewMode.addEventListener('change', renderWishlist);

    // ---- Ordinamento wishlist ----
    window.setWishlistSortOrder = (order) => {
        currentWishlistSortOrder = order;
        wishlistSortAscBtn.classList.toggle('active', order === 'asc');
        wishlistSortDescBtn.classList.toggle('active', order === 'desc');
        renderWishlist();
    };

    // ---- Gestione form wishlist ----
    window.toggleAddWishlistForm = () => {
        addWishlistForm.style.display = addWishlistForm.style.display === 'none' ? 'block' : 'none';
        if (addWishlistForm.style.display === 'block') {
            clearWishlistForm();
        }
    };

    window.clearWishlistForm = () => {
        wishlistForm.reset();
        editingWishlistId = null;
        document.getElementById('wishlistSearchResults').style.display = 'none';
        // Ripristina priorità media come default
        document.getElementById('wishlistBookPriority').value = '2';
    };

    // ---- Ricerca automatica libri per wishlist ----
    window.searchWishlistBookData = async () => {
        const title = document.getElementById('wishlistBookTitle').value.trim();
        const author = document.getElementById('wishlistBookAuthor').value.trim();
        
        if (!title || !author) {
            alert('Inserisci titolo e autore per cercare automaticamente');
            return;
        }
        
        // Controlla duplicati nella wishlist prima di cercare
        if (!editingWishlistId) {
            const isDuplicate = allWishlistItems.some(item => 
                item.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                item.author.toLowerCase().trim() === author.toLowerCase().trim()
            );
            
            if (isDuplicate) {
                const searchResults = document.getElementById('wishlistSearchResults');
                searchResults.innerHTML = `
                    <div class="manual-message">
                        <h4>⚠️ Libro già presente nella wishlist</h4>
                        <p>Il libro "<strong>${title}</strong>" di <strong>${author}</strong> è già presente nella tua wishlist.</p>
                        <p>Non è possibile aggiungere duplicati.</p>
                    </div>
                `;
                searchResults.style.display = 'block';
                return;
            }
            
            // Controlla anche se è già nei libri letti
            const isInLibrary = allBooks.some(book => 
                book.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === author.toLowerCase().trim()
            );
            
            if (isInLibrary) {
                const searchResults = document.getElementById('wishlistSearchResults');
                searchResults.innerHTML = `
                    <div class="manual-message">
                        <h4>📚 Libro già letto</h4>
                        <p>Il libro "<strong>${title}</strong>" di <strong>${author}</strong> è già presente nella tua biblioteca.</p>
                        <p>Non serve aggiungerlo alla wishlist se l'hai già letto!</p>
                    </div>
                `;
                searchResults.style.display = 'block';
                return;
            }
        }
        
        const searchResults = document.getElementById('wishlistSearchResults');
        searchResults.style.display = 'block';
        searchResults.innerHTML = '<div class="loading-search">🔍 Cercando informazioni sul libro...</div>';
        
        try {
            const googleResults = await searchGoogleBooks(title, author);
            const openLibraryResults = await searchOpenLibrary(title, author);
            
            const allResults = [...googleResults, ...openLibraryResults];
            
            if (allResults.length > 0) {
                displayWishlistSearchResults(allResults);
            } else {
                searchResults.innerHTML = `
                    <div class="manual-message">
                        <h4>📖 Nessun risultato trovato</h4>
                        <p>Non sono riuscito a trovare informazioni automatiche per questo libro.</p>
                        <p>Compila manualmente i campi sottostanti.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Errore nella ricerca wishlist:', error);
            searchResults.innerHTML = `
                <div class="manual-message">
                    <h4>⚠️ Errore nella ricerca</h4>
                    <p>Si è verificato un errore durante la ricerca automatica.</p>
                    <p>Compila manualmente i campi.</p>
                </div>
            `;
        }
    };
    
    function displayWishlistSearchResults(results) {
        const searchResults = document.getElementById('wishlistSearchResults');
        let html = '<h4 style="margin-bottom: 1rem;">📚 Risultati trovati - Clicca per selezionare:</h4>';
        
        results.forEach((result, index) => {
            html += `
                <div class="api-result" onclick="selectWishlistBookData(${index})">
                    <h4>${result.title}</h4>
                    <p><strong>Autore:</strong> ${result.author}</p>
                    ${result.year ? `<p><strong>Anno:</strong> ${result.year}</p>` : ''}
                    ${result.publisher ? `<p><strong>Editore:</strong> ${result.publisher}</p>` : ''}
                    ${result.pages ? `<p><strong>Pagine:</strong> ${result.pages}</p>` : ''}
                    ${result.isbn ? `<p><strong>ISBN:</strong> ${result.isbn}</p>` : ''}
                    <p><small><strong>Fonte:</strong> ${result.source}</small></p>
                </div>
            `;
        });
        
        searchResults.innerHTML = html;
        window.currentWishlistSearchResults = results;
    }
    
    window.selectWishlistBookData = (index) => {
        const result = window.currentWishlistSearchResults[index];
        if (!result) return;
        
        document.getElementById('wishlistBookTitle').value = result.title;
        document.getElementById('wishlistBookAuthor').value = result.author;
        if (result.year) document.getElementById('wishlistBookYear').value = result.year;
        if (result.publisher) document.getElementById('wishlistBookPublisher').value = result.publisher;
        if (result.pages) document.getElementById('wishlistBookPages').value = result.pages;
        if (result.isbn) document.getElementById('wishlistBookIsbn').value = result.isbn;
        if (result.description) document.getElementById('wishlistBookDescription').value = result.description;
        
        if (result.categories && result.categories.length > 0) {
            const currentTags = document.getElementById('wishlistBookTags').value;
            const newTags = result.categories.slice(0, 3).join(', ');
            document.getElementById('wishlistBookTags').value = currentTags ? `${currentTags}, ${newTags}` : newTags;
        }
        
        document.getElementById('wishlistSearchResults').style.display = 'none';
        
        const searchResults = document.getElementById('wishlistSearchResults');
        searchResults.innerHTML = `
            <div class="api-result">
                <h4>✅ Dati importati con successo!</h4>
                <p>I campi sono stati compilati automaticamente. Puoi modificarli se necessario.</p>
            </div>
        `;
        searchResults.style.display = 'block';
        
        setTimeout(() => {
            searchResults.style.display = 'none';
        }, 3000);
    };
    
    // ---- Aggiunta/Modifica elementi wishlist ----
    window.addNewWishlistItem = async (event) => {
        event.preventDefault();
        
        const itemData = {
            title: document.getElementById('wishlistBookTitle').value.trim(),
            author: document.getElementById('wishlistBookAuthor').value.trim(),
            year: parseInt(document.getElementById('wishlistBookYear').value) || null,
            publisher: document.getElementById('wishlistBookPublisher').value.trim() || null,
            pages: parseInt(document.getElementById('wishlistBookPages').value) || null,
            isbn: document.getElementById('wishlistBookIsbn').value.trim() || null,
            description: document.getElementById('wishlistBookDescription').value.trim() || null,
            tags: document.getElementById('wishlistBookTags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t),
            priority: parseInt(document.getElementById('wishlistBookPriority').value) || 2,
            price: document.getElementById('wishlistBookPrice').value.trim() || null,
            notes: document.getElementById('wishlistBookNotes').value.trim() || null,
            owner_uid: 'anonymous',
            updated_at: new Date()
        };

        if (!itemData.title || !itemData.author) {
            alert('Titolo e autore sono obbligatori');
            return;
        }

        // Controllo duplicati nella wishlist
        if (!editingWishlistId) {
            const isDuplicateInWishlist = allWishlistItems.some(item => 
                item.title.toLowerCase().trim() === itemData.title.toLowerCase().trim() && 
                item.author.toLowerCase().trim() === itemData.author.toLowerCase().trim()
            );
            
            if (isDuplicateInWishlist) {
                alert(`⚠️ LIBRO GIÀ NELLA WISHLIST\n\nIl libro "${itemData.title}" di ${itemData.author} è già presente nella tua wishlist.\n\nNon è possibile aggiungere duplicati.`);
                return;
            }
            
            // Controlla se è già nei libri letti
            const isInLibrary = allBooks.some(book => 
                book.title.toLowerCase().trim() === itemData.title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === itemData.author.toLowerCase().trim()
            );
            
            if (isInLibrary) {
                const confirm = window.confirm(`📚 LIBRO GIÀ LETTO\n\nIl libro "${itemData.title}" di ${itemData.author} è già presente nella tua biblioteca.\n\nVuoi comunque aggiungerlo alla wishlist? (Potrebbe essere utile per rileggere o regalare)`);
                if (!confirm) return;
            }
        }

        try {
            console.log("💾 Tentativo di salvataggio elemento wishlist su Firebase...", itemData);
            
            if (editingWishlistId) {
                console.log("📝 Aggiornamento elemento wishlist esistente con ID:", editingWishlistId);
                await updateDoc(doc(db, "wishlist", editingWishlistId), itemData);
                console.log("✅ Elemento wishlist aggiornato con successo!");
                alert('Elemento wishlist aggiornato con successo!');
            } else {
                itemData.created_at = new Date();
                const docId = Date.now().toString();
                console.log("🆕 Aggiunta nuovo elemento wishlist con ID:", docId, itemData);
                await setDoc(doc(db, "wishlist", docId), itemData);
                console.log("✅ Elemento wishlist salvato con successo su Firebase!");
                alert('✅ Libro aggiunto con successo alla tua wishlist!');
            }
            
            toggleAddWishlistForm();
            clearWishlistForm();
        } catch (error) {
            console.error("❌ Errore nel salvare l'elemento wishlist:", error);
            console.error("❌ Dettagli errore:", error.code, error.message);
            alert("Errore nel salvare l'elemento wishlist: " + error.message);
        }
    };

    window.editWishlistItem = (id) => {
        const item = allWishlistItems.find(i => i.id === id);
        if (!item) return;

        editingWishlistId = id;
        document.getElementById('wishlistBookTitle').value = item.title || '';
        document.getElementById('wishlistBookAuthor').value = item.author || '';
        document.getElementById('wishlistBookYear').value = item.year || '';
        document.getElementById('wishlistBookPublisher').value = item.publisher || '';
        document.getElementById('wishlistBookPages').value = item.pages || '';
        document.getElementById('wishlistBookIsbn').value = item.isbn || '';
        document.getElementById('wishlistBookDescription').value = item.description || '';
        document.getElementById('wishlistBookTags').value = (item.tags || []).join(', ');
        document.getElementById('wishlistBookPriority').value = item.priority || 2;
        document.getElementById('wishlistBookPrice').value = item.price || '';
        document.getElementById('wishlistBookNotes').value = item.notes || '';
        
        document.getElementById('wishlistSearchResults').style.display = 'none';
        addWishlistForm.style.display = 'block';
    };

    // ---- Cancellazione elemento wishlist ----
    window.deleteWishlistItem = async (id) => {
        const item = allWishlistItems.find(i => i.id === id);
        if (!item) {
            alert('Elemento wishlist non trovato');
            return;
        }

        const confirmMessage = `🗑️ ELIMINA DALLA WISHLIST\n\nSei sicuro di voler rimuovere questo libro dalla tua wishlist?\n\n📖 "${item.title}"\n✍️ di ${item.author}\n\n⚠️ Questa operazione non può essere annullata!`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            console.log("🗑️ Tentativo di eliminazione elemento wishlist:", id, item.title);
            await deleteDoc(doc(db, "wishlist", id));
            console.log("✅ Elemento wishlist eliminato con successo!");
            alert('✅ Elemento rimosso dalla wishlist!');
        } catch (error) {
            console.error("❌ Errore nell'eliminazione dell'elemento wishlist:", error);
            console.error("❌ Dettagli errore:", error.code, error.message);
            alert(`❌ Errore nell'eliminazione: ${error.message}`);
        }
    };

    // ---- Sposta dalla wishlist ai libri letti ----
    window.moveToLibrary = async (wishlistId) => {
        const item = allWishlistItems.find(i => i.id === wishlistId);
        if (!item) return;

        // Controlla se è già nei libri
        const isAlreadyInLibrary = allBooks.some(book => 
            book.title.toLowerCase().trim() === item.title.toLowerCase().trim() && 
            book.author.toLowerCase().trim() === item.author.toLowerCase().trim()
        );

        if (isAlreadyInLibrary) {
            alert('📚 Questo libro è già presente nella tua biblioteca!');
            return;
        }

        // Crea un dialog personalizzato per voto e commento
        const dialog = document.createElement('div');
        dialog.id = 'moveToLibraryDialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
            opacity: 0;
            transition: all 0.3s ease;
        `;
        
        dialog.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(247,250,252,0.95) 100%);
                backdrop-filter: blur(20px);
                padding: 2rem;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                max-width: 500px;
                width: 90%;
                border: 1px solid rgba(255,255,255,0.3);
            ">
                <h3 style="margin: 0 0 1rem 0; color: var(--text-primary); text-align: center;">
                    📚 Aggiungi "${escapeHtml(item.title)}" alla Biblioteca
                </h3>
                <p style="color: var(--text-secondary); text-align: center; margin-bottom: 1.5rem;">
                    di <strong>${escapeHtml(item.author)}</strong>
                </p>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                        Voto (opzionale):
                    </label>
                    <select id="moveLibraryRating" style="
                        width: 100%;
                        padding: 0.75rem;
                        border: 2px solid #e1e8ed;
                        border-radius: 10px;
                        font-size: 1rem;
                        background: white;
                        transition: all 0.3s ease;
                    ">
                        <option value="">Nessun voto</option>
                        <option value="1">⭐ 1 - Pessimo</option>
                        <option value="2">⭐⭐ 2 - Scarso</option>
                        <option value="3">⭐⭐⭐ 3 - Buono</option>
                        <option value="4">⭐⭐⭐⭐ 4 - Ottimo</option>
                        <option value="5">⭐⭐⭐⭐⭐ 5 - Eccellente</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                        Commento (opzionale):
                    </label>
                    <textarea id="moveLibraryComment" rows="4" placeholder="Le tue impressioni sul libro..." style="
                        width: 100%;
                        padding: 0.75rem;
                        border: 2px solid #e1e8ed;
                        border-radius: 10px;
                        font-size: 1rem;
                        font-family: inherit;
                        resize: vertical;
                        background: white;
                        transition: all 0.3s ease;
                    ">${escapeHtml(item.notes || '')}</textarea>
                    <small style="color: var(--text-muted); margin-top: 0.25rem; display: block;">
                        ${item.notes ? 'Le tue note dalla wishlist sono state precompilate' : ''}
                    </small>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button onclick="cancelMoveToLibrary()" style="
                        padding: 0.75rem 1.5rem;
                        border: 2px solid var(--primary-color);
                        background: transparent;
                        color: var(--primary-color);
                        border-radius: 25px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">
                        Annulla
                    </button>
                    <button onclick="confirmMoveToLibrary('${wishlistId}')" style="
                        padding: 0.75rem 1.5rem;
                        border: none;
                        background: var(--primary-gradient);
                        color: white;
                        border-radius: 25px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        box-shadow: var(--shadow-md);
                    ">
                        📚 Aggiungi alla Biblioteca
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Animazione di entrata
        setTimeout(() => {
            dialog.style.opacity = '1';
        }, 10);
        
        // Gestione chiusura con ESC e click fuori
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                cancelMoveToLibrary();
            }
        };
        
        const handleClickOutside = (e) => {
            if (e.target === dialog) {
                cancelMoveToLibrary();
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        dialog.addEventListener('click', handleClickOutside);
        
        // Salva i riferimenti per poterli rimuovere dopo
        dialog.handleKeyDown = handleKeyDown;
        dialog.handleClickOutside = handleClickOutside;
        
        // Focus sul primo campo
        setTimeout(() => {
            document.getElementById('moveLibraryRating').focus();
        }, 100);
    };
    
    // Funzione per annullare il trasferimento
    window.cancelMoveToLibrary = () => {
        const dialog = document.getElementById('moveToLibraryDialog');
        if (dialog) {
            // Rimuovi gli event listeners
            if (dialog.handleKeyDown) {
                document.removeEventListener('keydown', dialog.handleKeyDown);
            }
            if (dialog.handleClickOutside) {
                dialog.removeEventListener('click', dialog.handleClickOutside);
            }
            
            // Animazione di uscita
            dialog.style.opacity = '0';
            dialog.style.transform = 'scale(0.95)';
            
            setTimeout(() => {
                dialog.remove();
            }, 200);
        }
    };
    
    // Funzione per confermare il trasferimento con voto e commento
    window.confirmMoveToLibrary = async (wishlistId) => {
        const item = allWishlistItems.find(i => i.id === wishlistId);
        if (!item) return;
        
        const rating = document.getElementById('moveLibraryRating').value;
        const comment = document.getElementById('moveLibraryComment').value.trim();
        
        try {
            // Prepara i dati per la biblioteca
            const bookData = {
                title: item.title,
                author: item.author,
                year: item.year,
                publisher: item.publisher,
                pages: item.pages,
                isbn: item.isbn,
                description: item.description,
                tags: item.tags || [],
                rating: rating ? parseInt(rating) : null,
                comment: comment || null,
                owner_uid: 'anonymous',
                created_at: new Date(),
                updated_at: new Date()
            };

            // Aggiungi ai libri
            await setDoc(doc(db, "books", Date.now().toString()), bookData);
            
            // Rimuovi dalla wishlist
            await deleteDoc(doc(db, "wishlist", wishlistId));
            
            // Chiudi il dialog
            cancelMoveToLibrary();

            // Messaggio di successo personalizzato
            let successMessage = `✅ "${item.title}" è stato aggiunto alla tua biblioteca!`;
            if (rating) {
                const ratingText = ['', 'Pessimo', 'Scarso', 'Buono', 'Ottimo', 'Eccellente'][parseInt(rating)];
                successMessage += `\n⭐ Voto: ${rating}/5 (${ratingText})`;
            }
            if (comment) {
                successMessage += `\n💭 Commento salvato`;
            }
            
            alert(successMessage);
        } catch (error) {
            console.error("Errore nello spostamento:", error);
            alert("Errore nello spostamento del libro: " + error.message);
            cancelMoveToLibrary();
        }
    };

    // ---- Utility per filtri wishlist ----
    window.clearAllWishlistFilters = () => {
        wishlistSearchInput.value = '';
        wishlistAuthorFilter.value = '';
        wishlistYearMin.value = '';
        wishlistYearMax.value = '';
        wishlistPagesMin.value = '';
        wishlistPagesMax.value = '';
        wishlistHasTagsFilter.checked = false;
        wishlistHasDescriptionFilter.checked = false;
        wishlistPriorityFilter.value = '';
        
        wishlistTitleSuggestions.style.display = 'none';
        wishlistAuthorSuggestions.style.display = 'none';
        
        wishlistTagCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        renderWishlist();
    };
    
    // ---- Controllo duplicati in tempo reale per wishlist ----
    function setupWishlistDuplicateCheck() {
        const titleInput = document.getElementById('wishlistBookTitle');
        const authorInput = document.getElementById('wishlistBookAuthor');
        
        if (!titleInput || !authorInput) return;
        
        function checkWishlistDuplicatesRealTime() {
            if (editingWishlistId) return;
            
            const title = titleInput.value.trim();
            const author = authorInput.value.trim();
            
            if (title && author) {
                const isDuplicateInWishlist = allWishlistItems.some(item => 
                    item.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                    item.author.toLowerCase().trim() === author.toLowerCase().trim()
                );
                
                const isInLibrary = allBooks.some(book => 
                    book.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                    book.author.toLowerCase().trim() === author.toLowerCase().trim()
                );
                
                const duplicateWarning = document.getElementById('wishlistDuplicateWarning');
                if (isDuplicateInWishlist) {
                    if (!duplicateWarning) {
                        const warning = document.createElement('div');
                        warning.id = 'wishlistDuplicateWarning';
                        warning.className = 'duplicate-warning';
                        warning.innerHTML = '⚠️ Questo libro è già presente nella tua wishlist';
                        authorInput.parentNode.insertBefore(warning, authorInput.nextSibling);
                    }
                } else if (isInLibrary) {
                    if (!duplicateWarning) {
                        const warning = document.createElement('div');
                        warning.id = 'wishlistDuplicateWarning';
                        warning.className = 'duplicate-warning';
                        warning.style.background = 'linear-gradient(135deg, #e6f3ff 0%, #cce6ff 100%)';
                        warning.style.borderColor = '#66b3ff';
                        warning.style.color = '#0066cc';
                        warning.innerHTML = '📚 Questo libro è già nella tua biblioteca';
                        authorInput.parentNode.insertBefore(warning, authorInput.nextSibling);
                    }
                } else {
                    if (duplicateWarning) {
                        duplicateWarning.remove();
                    }
                }
            } else {
                const duplicateWarning = document.getElementById('wishlistDuplicateWarning');
                if (duplicateWarning) {
                    duplicateWarning.remove();
                }
            }
        }
        
        titleInput.addEventListener('input', checkWishlistDuplicatesRealTime);
        authorInput.addEventListener('input', checkWishlistDuplicatesRealTime);
    }
    
    setTimeout(setupWishlistDuplicateCheck, 500);

    // ===== SEZIONE QUIZ =====
    
    // Variabili globali per il quiz
    let quizQuestions = [];
    let currentQuestionIndex = 0;
    let quizAnswers = {};
    let booksForRecommendation = [];
    
    // Configurazione API Gemini
    const GEMINI_API_KEY = 'AIzaSyBoUzUCb9ZaJ_aKXfXOwArqVt35U1Lg2j0';
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
    
    // ---- Avvio Quiz ----
    window.startQuiz = async () => {
        console.log("🧠 Avvio quiz di raccomandazione libri...");
        
        // Prepara i libri per la raccomandazione (solo quelli senza voto)
        booksForRecommendation = allBooks.filter(book => !book.rating || book.rating === null);
        
        if (booksForRecommendation.length === 0) {
            alert('🎉 Complimenti! Hai già valutato tutti i tuoi libri. Non ci sono libri da raccomandare.');
            return;
        }
        
        console.log("📚 Libri disponibili per raccomandazione:", booksForRecommendation.length);
        
        // Genera le domande del quiz
        await generateQuizQuestions();
        
        // Inizializza il quiz
        document.getElementById('quizIntro').style.display = 'none';
        document.getElementById('quizQuestions').style.display = 'block';
        document.getElementById('quizNavigation').style.display = 'flex';
        
        currentQuestionIndex = 0;
        quizAnswers = {};
        
        renderCurrentQuestion();
        updateProgress();
    };
    
    // ---- Generazione domande quiz ----
    async function generateQuizQuestions() {
        // Raccogli informazioni dalla libreria per creare domande personalizzate
        const allAuthorsSet = new Set();
        const allTagsSet = new Set();
        const allGenres = new Set();
        
        allBooks.forEach(book => {
            if (book.author) allAuthorsSet.add(book.author);
            if (book.tags && Array.isArray(book.tags)) {
                book.tags.forEach(tag => allTagsSet.add(tag));
            }
        });
        
        const authorsArray = Array.from(allAuthorsSet).slice(0, 8);
        const tagsArray = Array.from(allTagsSet).slice(0, 10);
        
        // Domande predefinite del quiz
        quizQuestions = [
            {
                id: 1,
                question: "Quale genere letterario preferisci?",
                type: "single",
                options: [
                    "Narrativa contemporanea",
                    "Fantascienza",
                    "Fantasy",
                    "Thriller/Giallo",
                    "Romanzo storico",
                    "Biografia/Autobiografia",
                    "Saggistica",
                    "Classici della letteratura"
                ]
            },
            {
                id: 2,
                question: "Che tipo di protagonista preferisci?",
                type: "single",
                options: [
                    "Eroe coraggioso che affronta grandi sfide",
                    "Personaggio complesso con difetti umani",
                    "Detective o investigatore",
                    "Persona comune in situazioni straordinarie",
                    "Genio o personaggio intellettuale",
                    "Antieroe ribelle",
                    "Personaggio storico reale",
                    "Non ho preferenze specifiche"
                ]
            },
            {
                id: 3,
                question: "Quale atmosfera preferisci nei libri?",
                type: "single",
                options: [
                    "Misteriosa e suspense",
                    "Romantica e sentimentale",
                    "Avventurosa ed epica",
                    "Introspettiva e riflessiva",
                    "Divertente e leggera",
                    "Drammatica e intensa",
                    "Realistica e quotidiana",
                    "Fantastica e immaginaria"
                ]
            },
            {
                id: 4,
                question: "Quanto lungo preferisci che sia un libro?",
                type: "single",
                options: [
                    "Breve (meno di 200 pagine)",
                    "Medio (200-400 pagine)",
                    "Lungo (400-600 pagine)",
                    "Molto lungo (oltre 600 pagine)",
                    "Non importa la lunghezza"
                ]
            }
        ];
        
        // Aggiungi domanda sugli autori se ce ne sono abbastanza
        if (authorsArray.length >= 4) {
            quizQuestions.push({
                id: 5,
                question: "Tra questi autori presenti nella tua biblioteca, quale preferisci?",
                type: "single",
                options: [...authorsArray, "Nessuno di questi", "Non ho preferenze"]
            });
        }
        
        // Aggiungi domanda sui tag se ce ne sono abbastanza
        if (tagsArray.length >= 4) {
            quizQuestions.push({
                id: 6,
                question: "Quali temi ti interessano di più? (Puoi sceglierne più di uno)",
                type: "multiple",
                options: tagsArray
            });
        }
        
        console.log("❓ Domande quiz generate:", quizQuestions.length);
    }
    
    // ---- Rendering domanda corrente ----
    function renderCurrentQuestion() {
        const questionsContainer = document.getElementById('quizQuestions');
        const question = quizQuestions[currentQuestionIndex];
        
        if (!question) return;
        
        let optionsHtml = '';
        const inputType = question.type === 'multiple' ? 'checkbox' : 'radio';
        const inputName = question.type === 'multiple' ? `question_${question.id}[]` : `question_${question.id}`;
        
        question.options.forEach((option, index) => {
            const inputId = `q${question.id}_${index}`;
            optionsHtml += `
                <li class="quiz-option">
                    <input type="${inputType}" id="${inputId}" name="${inputName}" value="${option}">
                    <label for="${inputId}">${option}</label>
                </li>
            `;
        });
        
        questionsContainer.innerHTML = `
            <div class="quiz-question active">
                <div class="question-header">
                    <span class="question-number">Domanda ${currentQuestionIndex + 1} di ${quizQuestions.length}</span>
                </div>
                <h3 class="question-title">${question.question}</h3>
                <ul class="quiz-options">
                    ${optionsHtml}
                </ul>
            </div>
        `;
        
        // Ripristina le risposte precedenti se esistono
        if (quizAnswers[question.id]) {
            const answers = Array.isArray(quizAnswers[question.id]) ? quizAnswers[question.id] : [quizAnswers[question.id]];
            answers.forEach(answer => {
                const input = questionsContainer.querySelector(`input[value="${answer}"]`);
                if (input) input.checked = true;
            });
        }
    }
    
    // ---- Navigazione quiz ----
    window.nextQuestion = () => {
        saveCurrentAnswer();
        
        if (currentQuestionIndex < quizQuestions.length - 1) {
            currentQuestionIndex++;
            renderCurrentQuestion();
            updateProgress();
        }
    };
    
    window.previousQuestion = () => {
        saveCurrentAnswer();
        
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderCurrentQuestion();
            updateProgress();
        }
    };
    
    // ---- Salvataggio risposta corrente ----
    function saveCurrentAnswer() {
        const question = quizQuestions[currentQuestionIndex];
        if (!question) return;
        
        const inputs = document.querySelectorAll(`input[name="question_${question.id}"], input[name="question_${question.id}[]"]`);
        const selectedValues = [];
        
        inputs.forEach(input => {
            if (input.checked) {
                selectedValues.push(input.value);
            }
        });
        
        if (selectedValues.length > 0) {
            quizAnswers[question.id] = question.type === 'multiple' ? selectedValues : selectedValues[0];
        }
    }
    
    // ---- Aggiornamento progress bar ----
    function updateProgress() {
        const progress = ((currentQuestionIndex + 1) / quizQuestions.length) * 100;
        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressText').textContent = `${currentQuestionIndex + 1} / ${quizQuestions.length}`;
        
        // Gestisci visibilità pulsanti
        document.getElementById('prevBtn').style.display = currentQuestionIndex === 0 ? 'none' : 'block';
        document.getElementById('nextBtn').style.display = currentQuestionIndex === quizQuestions.length - 1 ? 'none' : 'block';
        document.getElementById('finishBtn').style.display = currentQuestionIndex === quizQuestions.length - 1 ? 'block' : 'none';
    }
    
    // ---- Completamento quiz ----
    window.finishQuiz = async () => {
        saveCurrentAnswer();
        
        console.log("🎯 Completamento quiz con risposte:", quizAnswers);
        
        // Mostra loading
        document.getElementById('quizQuestions').style.display = 'none';
        document.getElementById('quizNavigation').style.display = 'none';
        document.getElementById('quizLoading').style.display = 'block';
        
        try {
            // Ottieni raccomandazione tramite Gemini
            const recommendation = await getBookRecommendation();
            
            // Mostra risultati
            displayRecommendation(recommendation);
        } catch (error) {
            console.error("❌ Errore nel completare il quiz:", error);
            showQuizError(error.message);
        }
    };
    
    // ---- Raccomandazione tramite Gemini AI ----
    async function getBookRecommendation() {
        // Se non hai la chiave API, usa un sistema di fallback
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            console.log("⚠️ Chiave API Gemini non configurata, uso sistema di fallback");
            return getFallbackRecommendation();
        }
        
        try {
            // Prepara il prompt per Gemini
            const prompt = createRecommendationPrompt();
            
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Errore API Gemini: ${response.status}`);
            }
            
            const data = await response.json();
            const aiResponse = data.candidates[0].content.parts[0].text;
            
            // Analizza la risposta di Gemini per estrarre il libro raccomandato
            return parseGeminiResponse(aiResponse);
            
        } catch (error) {
            console.error("❌ Errore chiamata Gemini:", error);
            // Fallback al sistema locale
            return getFallbackRecommendation();
        }
    }
    
    // ---- Creazione prompt per Gemini ----
    function createRecommendationPrompt() {
        const booksData = booksForRecommendation.map(book => ({
            title: book.title,
            author: book.author,
            year: book.year,
            tags: book.tags || [],
            description: book.description || '',
            pages: book.pages
        }));
        
        return `
Sei un esperto bibliotecario AI. Devi raccomandare UN SOLO libro da questa lista basandoti sulle preferenze dell'utente:

LIBRI DISPONIBILI:
${JSON.stringify(booksData, null, 2)}

PREFERENZE UTENTE:
${Object.entries(quizAnswers).map(([questionId, answer]) => {
    const question = quizQuestions.find(q => q.id == questionId);
    return `${question?.question}: ${Array.isArray(answer) ? answer.join(', ') : answer}`;
}).join('\n')}

ISTRUZIONI:
1. Analizza le preferenze dell'utente
2. Confronta con titoli, autori, tag e descrizioni dei libri
3. Scegli IL LIBRO PIÙ ADATTO
4. Rispondi SOLO con questo formato JSON:
{
  "recommendedBook": {
    "title": "titolo del libro",
    "author": "autore del libro"
  },
  "reason": "Spiegazione di massimo 100 parole del perché questo libro è perfetto per l'utente"
}

NON aggiungere altro testo oltre al JSON.
`;
    }
    
    // ---- Parsing risposta Gemini ----
    function parseGeminiResponse(response) {
        try {
            // Cerca il JSON nella risposta
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                // Trova il libro nella libreria
                const book = booksForRecommendation.find(b => 
                    b.title.toLowerCase().includes(parsed.recommendedBook.title.toLowerCase()) ||
                    parsed.recommendedBook.title.toLowerCase().includes(b.title.toLowerCase())
                );
                
                if (book) {
                    return {
                        book: book,
                        reason: parsed.reason
                    };
                }
            }
            
            // Se non trova match, usa fallback
            return getFallbackRecommendation();
            
        } catch (error) {
            console.error("❌ Errore parsing risposta Gemini:", error);
            return getFallbackRecommendation();
        }
    }
    
    // ---- Sistema di fallback per raccomandazione ----
    function getFallbackRecommendation() {
        console.log("🔄 Uso sistema di fallback per raccomandazione");
        
        let scoredBooks = booksForRecommendation.map(book => ({
            book: book,
            score: calculateBookScore(book)
        }));
        
        // Ordina per punteggio decrescente
        scoredBooks.sort((a, b) => b.score - a.score);
        
        const topBook = scoredBooks[0];
        
        return {
            book: topBook.book,
            reason: generateFallbackReason(topBook.book)
        };
    }
    
    // ---- Calcolo punteggio libro (sistema fallback) ----
    function calculateBookScore(book) {
        let score = 0;
        
        // Controlla preferenze genere
        if (quizAnswers[1]) {
            const genre = quizAnswers[1].toLowerCase();
            const bookTags = (book.tags || []).map(t => t.toLowerCase());
            const bookDescription = (book.description || '').toLowerCase();
            
            if (bookTags.some(tag => tag.includes(genre)) || bookDescription.includes(genre)) {
                score += 3;
            }
        }
        
        // Controlla preferenze autore
        if (quizAnswers[5] && book.author === quizAnswers[5]) {
            score += 5;
        }
        
        // Controlla tag interessanti
        if (quizAnswers[6] && Array.isArray(quizAnswers[6])) {
            const userTags = quizAnswers[6].map(t => t.toLowerCase());
            const bookTags = (book.tags || []).map(t => t.toLowerCase());
            const matchingTags = userTags.filter(tag => bookTags.includes(tag));
            score += matchingTags.length * 2;
        }
        
        // Controlla lunghezza preferita
        if (quizAnswers[4] && book.pages) {
            const lengthPref = quizAnswers[4];
            if (lengthPref.includes('Breve') && book.pages < 200) score += 1;
            else if (lengthPref.includes('Medio') && book.pages >= 200 && book.pages <= 400) score += 1;
            else if (lengthPref.includes('Lungo') && book.pages > 400 && book.pages <= 600) score += 1;
            else if (lengthPref.includes('Molto lungo') && book.pages > 600) score += 1;
        }
        
        return score;
    }
    
    // ---- Generazione ragione fallback ----
    function generateFallbackReason(book) {
        const reasons = [];
        
        if (book.tags && book.tags.length > 0) {
            reasons.push(`I suoi tag (${book.tags.slice(0, 2).join(', ')}) si allineano con i tuoi interessi`);
        }
        
        if (book.description) {
            reasons.push(`La trama sembra adatta al tuo stile di lettura`);
        }
        
        if (book.year && book.year > 2000) {
            reasons.push(`È un'opera contemporanea che rispecchia i gusti moderni`);
        }
        
        if (reasons.length === 0) {
            reasons.push(`Questo libro rappresenta una scelta interessante dalla tua biblioteca`);
        }
        
        return reasons.slice(0, 2).join(' e ') + '.';
    }
    
    // ---- Visualizzazione raccomandazione ----
    function displayRecommendation(recommendation) {
        document.getElementById('quizLoading').style.display = 'none';
        
        const { book, reason } = recommendation;
        
        const recommendedBookHtml = `
            <div class="book-recommendation">
                <div class="book-title">📖 ${escapeHtml(book.title)}</div>
                <div class="book-author">✍️ di ${escapeHtml(book.author)}</div>
                ${book.year ? `<div><strong>Anno:</strong> ${book.year}</div>` : ''}
                ${book.pages ? `<div><strong>Pagine:</strong> ${book.pages}</div>` : ''}
                ${book.tags && book.tags.length > 0 ? 
                    `<div><strong>Tag:</strong> ${book.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')}</div>` : ''}
                ${book.description ? `<div><strong>Descrizione:</strong> ${escapeHtml(book.description.substring(0, 200))}${book.description.length > 200 ? '...' : ''}</div>` : ''}
                <div class="recommendation-reason">
                    <strong>💡 Perché questo libro:</strong> ${escapeHtml(reason)}
                </div>
                <div class="recommendation-actions">
                    <button onclick="getSimilarBookSuggestion('${book.id || book.title}')" class="similar-book-btn">
                        🔍 Trova libro simile che non ho ancora
                    </button>
                </div>
                <div id="similarBookResult" style="display: none; margin-top: 1rem;"></div>
            </div>
        `;
        
        document.getElementById('recommendedBook').innerHTML = recommendedBookHtml;
        document.getElementById('quizResults').classList.add('show');
    }

    // ---- Suggerimento libro simile tramite Gemini ----
    window.getSimilarBookSuggestion = async (recommendedBookId) => {
        const resultDiv = document.getElementById('similarBookResult');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div class="loading">🤖 Sto cercando un libro simile che non hai ancora...</div>';
        
        try {
            // Trova il libro raccomandato
            const recommendedBook = booksForRecommendation.find(book => 
                book.id === recommendedBookId || book.title === recommendedBookId
            );
            
            if (!recommendedBook) {
                throw new Error('Libro raccomandato non trovato');
            }
            
            // Prepara i dati di tutti i libri che hai per evitare duplicati
            const allYourBooks = [...allBooks, ...allWishlistItems].map(book => ({
                title: book.title,
                author: book.author,
                tags: book.tags || [],
                description: book.description || ''
            }));
            
            // Crea il prompt per Gemini
            const prompt = `
Sei un esperto bibliotecario AI. L'utente ha appena ricevuto la raccomandazione di questo libro:

LIBRO RACCOMANDATO:
Titolo: ${recommendedBook.title}
Autore: ${recommendedBook.author}
Tag: ${(recommendedBook.tags || []).join(', ')}
Descrizione: ${recommendedBook.description || 'Non disponibile'}

LIBRI CHE L'UTENTE HA GIÀ (da evitare assolutamente):
${JSON.stringify(allYourBooks, null, 2)}

COMPITO:
Suggerisci UN SOLO libro simile al libro raccomandato che:
1. NON sia già nella sua collezione
2. Abbia temi, genere o stile simili
3. Sia dello stesso autore O di un autore con stile simile
4. Sia facilmente reperibile in libreria o online

Rispondi SOLO con questo formato JSON:
{
  "suggestedBook": {
    "title": "Titolo del libro suggerito",
    "author": "Autore del libro",
    "reason": "Spiegazione breve (max 80 parole) del perché è simile e perché dovrebbe interessargli",
    "where_to_find": "Breve suggerimento su dove trovarlo (libreria, online, ecc.)"
  }
}

NON aggiungere altro testo oltre al JSON.
            `;
            
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Errore API Gemini: ${response.status}`);
            }
            
            const data = await response.json();
            const aiResponse = data.candidates[0].content.parts[0].text;
            
            // Parse della risposta
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Risposta non valida dall\'API');
            }
            
            const suggestion = JSON.parse(jsonMatch[0]);
            
            // Visualizza il suggerimento
            resultDiv.innerHTML = `
                <div class="similar-book-suggestion">
                    <h4>🔍 Libro simile che potresti apprezzare:</h4>
                    <div class="suggested-book">
                        <div class="book-title">📚 ${escapeHtml(suggestion.suggestedBook.title)}</div>
                        <div class="book-author">✍️ di ${escapeHtml(suggestion.suggestedBook.author)}</div>
                        <div class="suggestion-reason">
                            <strong>💭 Perché ti piacerà:</strong> ${escapeHtml(suggestion.suggestedBook.reason)}
                        </div>
                        <div class="where-to-find">
                            <strong>🛒 Dove trovarlo:</strong> ${escapeHtml(suggestion.suggestedBook.where_to_find)}
                        </div>
                        <div class="suggestion-actions">
                            <button onclick="addToWishlistFromSuggestion('${escapeHtml(suggestion.suggestedBook.title)}', '${escapeHtml(suggestion.suggestedBook.author)}')" class="add-to-wishlist-btn">
                                ➕ Aggiungi alla Wishlist
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('❌ Errore nel suggerimento libro simile:', error);
            resultDiv.innerHTML = `
                <div class="error-suggestion">
                    <h4>⚠️ Errore nel suggerimento</h4>
                    <p>Non sono riuscito a trovare un libro simile al momento. Riprova più tardi o cerca manualmente libri simili dello stesso autore o genere.</p>
                </div>
            `;
        }
    };

    // ---- Aggiunta rapida alla wishlist dal suggerimento ----
    window.addToWishlistFromSuggestion = async (title, author) => {
        try {
            // Controlla se è già nella wishlist
            const isDuplicateInWishlist = allWishlistItems.some(item => 
                item.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                item.author.toLowerCase().trim() === author.toLowerCase().trim()
            );
            
            if (isDuplicateInWishlist) {
                alert('📚 Questo libro è già nella tua wishlist!');
                return;
            }
            
            // Controlla se è già nei libri letti
            const isInLibrary = allBooks.some(book => 
                book.title.toLowerCase().trim() === title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === author.toLowerCase().trim()
            );
            
            if (isInLibrary) {
                alert('📖 Questo libro è già nella tua biblioteca!');
                return;
            }
            
            // Aggiungi alla wishlist
            const wishlistData = {
                title: title,
                author: author,
                priority: 2, // Media priorità
                tags: [],
                owner_uid: 'anonymous',
                created_at: new Date(),
                updated_at: new Date()
            };
            
            const docId = Date.now().toString();
            await setDoc(doc(db, "wishlist", docId), wishlistData);
            
            alert('✅ Libro aggiunto alla tua wishlist!');
            
            // Aggiorna il pulsante per mostrare che è stato aggiunto
            const button = event.target;
            button.textContent = '✅ Aggiunto alla Wishlist';
            button.disabled = true;
            button.style.opacity = '0.6';
            
        } catch (error) {
            console.error('❌ Errore nell\'aggiungere alla wishlist:', error);
            alert('❌ Errore nell\'aggiungere il libro alla wishlist: ' + error.message);
        }
    };
    
    // ---- Gestione errori quiz ----
    function showQuizError(errorMessage) {
        document.getElementById('quizLoading').style.display = 'none';
        document.getElementById('errorMessage').textContent = errorMessage;
        document.getElementById('quizError').style.display = 'block';
    }
    
    // ---- Riavvio quiz ----
    window.restartQuiz = () => {
        // Reset stato quiz
        currentQuestionIndex = 0;
        quizAnswers = {};
        quizQuestions = [];
        
        // Reset UI
        document.getElementById('quizIntro').style.display = 'block';
        document.getElementById('quizQuestions').style.display = 'none';
        document.getElementById('quizNavigation').style.display = 'none';
        document.getElementById('quizResults').classList.remove('show');
        document.getElementById('quizLoading').style.display = 'none';
        document.getElementById('quizError').style.display = 'none';
        
        console.log("🔄 Quiz resettato");
    };

    // ===== SEZIONE ESPORTAZIONE =====
    
    // ---- Gestione menu esportazione ----
    window.showExportMenu = () => {
        const exportMenu = document.getElementById('exportMenu');
        exportMenu.style.display = 'block';
        exportMenu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    window.hideExportMenu = () => {
        const exportMenu = document.getElementById('exportMenu');
        exportMenu.style.display = 'none';
    };

    // ---- Esportazione JSON ----
    window.exportBooksJSON = () => {
        try {
            // Ottieni i libri filtrati attualmente visualizzati
            const filteredBooks = getFilteredBooks();
            
            if (filteredBooks.length === 0) {
                showExportNotification('⚠️ Nessun libro da esportare!', 'error');
                return;
            }

            // Prepara i dati per l'esportazione
            const exportData = {
                exportInfo: {
                    timestamp: new Date().toISOString(),
                    totalBooks: filteredBooks.length,
                    exportedBy: 'DGBBiblio',
                    version: '1.0'
                },
                books: filteredBooks.map(book => ({
                    title: book.title || '',
                    author: book.author || '',
                    year: book.year || null,
                    publisher: book.publisher || '',
                    pages: book.pages || null,
                    isbn: book.isbn || '',
                    description: book.description || '',
                    tags: book.tags || [],
                    rating: book.rating || null,
                    comment: book.comment || '',
                    createdAt: book.created_at || null,
                    updatedAt: book.updated_at || null
                }))
            };

            // Crea il file JSON
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            // Crea il link per il download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Nome file con timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            link.download = `biblioteca-dgb-${timestamp}.json`;
            
            // Avvia il download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showExportNotification(`✅ Esportati ${filteredBooks.length} libri in JSON!`);
            hideExportMenu();

        } catch (error) {
            console.error('❌ Errore durante l\'esportazione JSON:', error);
            showExportNotification('❌ Errore durante l\'esportazione JSON', 'error');
        }
    };

    // ---- Esportazione Excel (CSV) ----
    window.exportBooksExcel = () => {
        try {
            // Ottieni i libri filtrati attualmente visualizzati
            const filteredBooks = getFilteredBooks();
            
            if (filteredBooks.length === 0) {
                showExportNotification('⚠️ Nessun libro da esportare!', 'error');
                return;
            }

            // Intestazioni CSV
            const headers = [
                'Titolo',
                'Autore', 
                'Anno',
                'Editore',
                'Pagine',
                'ISBN',
                'Descrizione',
                'Tag',
                'Voto',
                'Commento',
                'Data Creazione',
                'Ultima Modifica'
            ];

            // Converti i libri in righe CSV
            const csvRows = [headers.join(',')];
            
            filteredBooks.forEach(book => {
                const row = [
                    escapeCSV(book.title || ''),
                    escapeCSV(book.author || ''),
                    book.year || '',
                    escapeCSV(book.publisher || ''),
                    book.pages || '',
                    escapeCSV(book.isbn || ''),
                    escapeCSV(book.description || ''),
                    escapeCSV((book.tags || []).join('; ')),
                    book.rating || '',
                    escapeCSV(book.comment || ''),
                    book.created_at ? new Date(book.created_at.seconds * 1000).toLocaleDateString('it-IT') : '',
                    book.updated_at ? new Date(book.updated_at.seconds * 1000).toLocaleDateString('it-IT') : ''
                ];
                csvRows.push(row.join(','));
            });

            // Crea il file CSV
            const csvContent = csvRows.join('\n');
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM per Excel
            
            // Crea il link per il download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Nome file con timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            link.download = `biblioteca-dgb-${timestamp}.csv`;
            
            // Avvia il download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showExportNotification(`✅ Esportati ${filteredBooks.length} libri in Excel!`);
            hideExportMenu();

        } catch (error) {
            console.error('❌ Errore durante l\'esportazione Excel:', error);
            showExportNotification('❌ Errore durante l\'esportazione Excel', 'error');
        }
    };

    // ---- Funzioni di utilità per l'esportazione ----
    function escapeCSV(text) {
        if (!text) return '';
        // Converti in stringa e gestisci virgolette e virgole
        const str = String(text);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function showExportNotification(message, type = 'success') {
        // Rimuovi notifica precedente se esiste
        const existingNotification = document.querySelector('.export-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Crea nuova notifica
        const notification = document.createElement('div');
        notification.className = `export-notification ${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    font-size: 1.2rem;
                    cursor: pointer;
                    padding: 0;
                    margin-left: 0.5rem;
                ">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);

        // Rimuovi automaticamente dopo 5 secondi
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}
