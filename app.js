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

// ===== VARIABILI GLOBALI =====
let allBooks = [];
let allWishlistItems = [];
let allAuthors = new Set();
let allTitles = new Set();
let allTags = new Set();

// === FUNZIONE DI INIZIALIZZAZIONE PREFERENZE ===
async function initializeUserPreferences() {
    if (!window.bookRecommendationSystem) {
        console.log('⚠️ Sistema di raccomandazioni non ancora disponibile, attendo...');
        return;
    }
    
    try {
        console.log('🔄 Caricamento preferenze utente da Firebase...');
        
        // Prova a caricare da Firebase
        await window.bookRecommendationSystem.loadUserDataFromFirebase();
        
        // Se non ci sono dati su Firebase, carica da localStorage come fallback
        const stats = window.bookRecommendationSystem.getStats();
        if (stats.feedbackEntries === 0 && stats.viewHistory === 0) {
            console.log('📱 Caricamento preferenze da localStorage come fallback...');
            window.bookRecommendationSystem.loadUserDataFromStorage();
        }
        
        // Aggiorna le statistiche nelle sezioni se le funzioni sono disponibili
        setTimeout(() => {
            if (typeof window.updateRecommendationStats === 'function') {
                window.updateRecommendationStats();
            }
            if (typeof window.updateUserStats === 'function') {
                window.updateUserStats();
            }
        }, 1000);
        
        console.log('✅ Preferenze utente inizializzate');
        console.log('📊 Stats:', stats);
        
    } catch (error) {
        console.error('❌ Errore nel caricamento preferenze:', error);
        // Fallback a localStorage
        if (window.bookRecommendationSystem) {
            window.bookRecommendationSystem.loadUserDataFromStorage();
        }
    }
}

// === FUNZIONE DI SINCRONIZZAZIONE AUTOMATICA ===
function setupAutoSync() {
    if (!window.bookRecommendationSystem) return;
    
    console.log('🔄 Configurazione sincronizzazione automatica...');
    
    // Sincronizza ogni 5 minuti se l'utente è attivo
    setInterval(async () => {
        if (document.visibilityState === 'visible' && window.bookRecommendationSystem) {
            try {
                await window.bookRecommendationSystem.syncWithFirebase();
                console.log('🔄 Sincronizzazione automatica completata');
            } catch (error) {
                console.warn('⚠️ Sincronizzazione automatica fallita:', error);
            }
        }
    }, 5 * 60 * 1000); // 5 minuti
    
    // Sincronizza quando la pagina torna visibile
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && window.bookRecommendationSystem) {
            try {
                console.log('👁️ Pagina tornata visibile, sincronizzazione...');
                await window.bookRecommendationSystem.loadUserDataFromFirebase();
                
                // Aggiorna UI se siamo nella sezione preferenze
                if (document.getElementById('preferencesSection')?.style.display !== 'none') {
                    if (typeof window.updateUserStats === 'function') {
                        window.updateUserStats();
                    }
                }
            } catch (error) {
                console.warn('⚠️ Sincronizzazione al focus fallita:', error);
            }
        }
    });
    
    console.log('✅ Sincronizzazione automatica configurata');
}

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
    let unsubscribeBooks = null;
    let currentSortOrder = 'asc';

    // Avvia l'ascolto dei libri senza autenticazione
    startListeningBooks();
    
    // Aggiungi alcuni dati di test per vedere se i datalist funzionano
    setTimeout(() => {
        if (allTitles.size === 0) {
            console.log("📚 Nessun libro caricato da Firebase, aggiungo dati di test per i datalist");
            allTitles.add("Il Signore degli Anelli");
            allTitles.add("1984");
            allTitles.add("Harry Potter e la Pietra Filosofale");
            
            allAuthors.add("J.R.R. Tolkien");
            allAuthors.add("George Orwell");
            allAuthors.add("J.K. Rowling");
            
            updateFormDataLists();
        }
    }, 2000);

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

        // Aggiorna i datalist per il form di inserimento libri
        updateFormDataLists();

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
                    <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button onclick="editBook('${book.id}')" class="btn-secondary" style="flex: 1; min-width: 80px;">Modifica</button>
                        <button onclick="deleteBook('${book.id}')" class="btn-danger" style="flex: 1; min-width: 80px;" title="Elimina libro">🗑️ Elimina</button>
                        <button onclick="showBookRecommendations('${book.id}')" class="btn-primary" style="flex: 1; min-width: 80px; background: var(--accent-gradient);" title="Trova libri simili">✨ Simili</button>
                    </div>
                    <div id="recommendations-${book.id}" class="book-recommendations" style="margin-top: 0.5rem; display: none;"></div>
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
                
                // Gestione trama con pulsante "Trama completa"
                let descriptionHtml = '';
                if (book.description) {
                    const isLong = book.description.length > 200;
                    const shortDescription = book.description.substring(0, 200);
                    descriptionHtml = `
                        <div class="description" style="margin-top: 0.5rem; font-style: italic;">
                            <div id="desc-short-${book.id}" ${isLong ? '' : 'style="display: none;"'}>
                                ${escapeHtml(shortDescription)}${isLong ? '...' : ''}
                                ${isLong ? `<button onclick="toggleFullDescription('${book.id}')" class="btn-link" style="margin-left: 0.5rem; font-size: 0.85rem; padding: 0.25rem 0.5rem; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer;">📖 Trama completa</button>` : ''}
                            </div>
                            <div id="desc-full-${book.id}" style="display: none; color: var(--text-secondary); line-height: 1.5; background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 8px; border-left: 3px solid var(--accent-color);">
                                <strong>Trama:</strong><br>${escapeHtml(book.description)}
                                <button onclick="toggleFullDescription('${book.id}')" class="btn-link" style="margin-top: 0.5rem; font-size: 0.85rem; padding: 0.25rem 0.5rem; background: var(--text-muted); color: white; border: none; border-radius: 4px; cursor: pointer;">➖ Riduci</button>
                            </div>
                        </div>
                    `;
                    // Se la descrizione è breve, mostra direttamente quella completa
                    if (!isLong) {
                        descriptionHtml = `<div class="small" style="margin-top: 0.5rem; font-style: italic;">${escapeHtml(book.description)}</div>`;
                    }
                }
                
                bookCard.innerHTML = `
                    <h3>${escapeHtml(book.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(book.author || 'Autore sconosciuto')}</div>
                    <div class="year">${book.year || 'Anno non specificato'}</div>
                    ${ratingHtml}
                    ${additionalInfo.length > 0 ? `<div class="small" style="margin-top: 0.5rem;">${additionalInfo.join(' • ')}</div>` : ''}
                    ${descriptionHtml}
                    ${commentHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 0.5rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button onclick="editBook('${book.id}')" class="btn-secondary" style="flex: 1; min-width: 100px;">Modifica</button>
                        <button onclick="deleteBook('${book.id}')" class="btn-danger" style="flex: 1; min-width: 100px;" title="Elimina libro">🗑️ Elimina</button>
                        <button onclick="showBookRecommendations('${book.id}')" class="btn-primary" style="flex: 1; min-width: 100px; background: var(--accent-gradient);" title="Trova libri simili">✨ Simili</button>
                    </div>
                    <div id="recommendations-${book.id}" class="book-recommendations" style="margin-top: 1rem; display: none;"></div>
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
    
    // ---- Funzione per toggle trama completa ----
    window.toggleFullDescription = (id) => {
        const shortElement = document.getElementById(`desc-short-${id}`);
        const fullElement = document.getElementById(`desc-full-${id}`);
        
        if (shortElement && fullElement) {
            if (fullElement.style.display === 'none') {
                // Mostra trama completa
                shortElement.style.display = 'none';
                fullElement.style.display = 'block';
                fullElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                // Mostra trama ridotta
                fullElement.style.display = 'none';
                shortElement.style.display = 'block';
            }
        }
    };
    
    // ---- Funzioni per raccomandazioni libri ----
    window.showBookRecommendations = async (bookId) => {
        const book = allBooks.find(b => b.id === bookId);
        if (!book) {
            console.warn(`⚠️ Libro con ID ${bookId} non trovato`);
            return;
        }

        const recommendationsContainer = document.getElementById(`recommendations-${bookId}`);
        if (!recommendationsContainer) {
            console.warn(`⚠️ Container raccomandazioni non trovato per ${bookId}`);
            return;
        }

        // Toggle visibilità
        if (recommendationsContainer.style.display === 'none' || !recommendationsContainer.style.display) {
            recommendationsContainer.style.display = 'block';
            
            // Genera raccomandazioni se non esistono già
            if (recommendationsContainer.innerHTML.trim() === '') {
                try {
                    console.log(`🎯 Generazione raccomandazioni per: "${book.title}"`);
                    
                    await bookRecommendationUI.renderRecommendations(
                        `recommendations-${bookId}`, 
                        book, 
                        allBooks, 
                        {
                            showReasons: true,
                            showStats: false,
                            maxRecommendations: 4,
                            enableAnimations: true,
                            compact: true
                        }
                    );
                    
                    // Scroll smooth al container
                    setTimeout(() => {
                        recommendationsContainer.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }, 500);
                    
                } catch (error) {
                    console.error('❌ Errore nella generazione raccomandazioni:', error);
                    recommendationsContainer.innerHTML = `
                        <div style="text-align: center; padding: 1rem; color: var(--text-muted);">
                            <p>😅 Non riesco a generare raccomandazioni al momento</p>
                            <button onclick="showBookRecommendations('${bookId}')" class="btn-secondary small">
                                🔄 Riprova
                            </button>
                        </div>
                    `;
                }
            } else {
                // Se già esistono, scroll al container
                setTimeout(() => {
                    recommendationsContainer.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }, 100);
            }
        } else {
            // Nascondi raccomandazioni
            recommendationsContainer.style.display = 'none';
        }
    };

    // ---- Integrazione raccomandazioni con Wishlist ----
    window.addRecommendedBookToWishlist = async (bookData) => {
        try {
            // Controlla se già presente nella wishlist
            const existsInWishlist = allWishlistItems.some(item => 
                item.title.toLowerCase().trim() === bookData.title.toLowerCase().trim() && 
                item.author.toLowerCase().trim() === bookData.author.toLowerCase().trim()
            );

            if (existsInWishlist) {
                alert('📚 Questo libro è già nella tua wishlist!');
                return;
            }

            // Controlla se già letto
            const existsInLibrary = allBooks.some(book => 
                book.title.toLowerCase().trim() === bookData.title.toLowerCase().trim() && 
                book.author.toLowerCase().trim() === bookData.author.toLowerCase().trim()
            );

            if (existsInLibrary) {
                alert('📖 Hai già questo libro nella tua biblioteca!');
                return;
            }

            // Aggiungi alla wishlist
            const wishlistData = {
                title: bookData.title,
                author: bookData.author,
                description: bookData.description || '',
                tags: bookData.tags || [],
                year: bookData.year || null,
                pages: bookData.pages || null,
                priority: 2, // Priorità media per default
                notes: 'Aggiunto dalle raccomandazioni IA',
                addedAt: new Date().toISOString()
            };

            const wishlistRef = collection(db, 'wishlist');
            await setDoc(doc(wishlistRef), wishlistData);

            // Feedback visivo
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 2rem;
                right: 2rem;
                background: var(--success-color);
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 12px;
                box-shadow: var(--shadow-xl);
                z-index: 1000;
                font-weight: 600;
                animation: slideInRight 0.3s ease;
            `;
            notification.innerHTML = `
                ✅ "${bookData.title}" aggiunto alla wishlist!
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);

            console.log(`✅ Libro "${bookData.title}" aggiunto alla wishlist`);

        } catch (error) {
            console.error('❌ Errore nell\'aggiunta alla wishlist:', error);
            alert('❌ Errore nell\'aggiunta alla wishlist. Riprova.');
        }
    };

    // ---- Reset sistema raccomandazioni (per debug/admin) ----
    window.resetRecommendationSystem = () => {
        if (confirm('🔄 Vuoi resettare tutti i dati del sistema di raccomandazione?\n\nQuesta operazione cancellerà:\n- Feedback sui libri\n- Cronologia visualizzazioni\n- Cache del sistema\n\nL\'operazione non può essere annullata!')) {
            bookRecommendationSystem.resetUserData();
            alert('✅ Sistema di raccomandazione resettato!');
        }
    };

    // ---- Esportazione dati raccomandazioni ----
    window.exportRecommendationData = () => {
        try {
            const data = bookRecommendationSystem.exportUserData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `raccomandazioni_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('📥 Dati raccomandazioni esportati');
        } catch (error) {
            console.error('❌ Errore nell\'esportazione:', error);
        }
    };

    // ---- Importazione dati raccomandazioni ----
    window.importRecommendationData = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    bookRecommendationSystem.importUserData(data);
                    alert('✅ Dati raccomandazioni importati con successo!');
                } catch (error) {
                    console.error('❌ Errore nell\'importazione:', error);
                    alert('❌ Errore nel file di importazione.');
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    };

    // ---- Raccomandazioni per wishlist ----
    window.showWishlistRecommendations = async (wishlistId) => {
        const wishlistItem = allWishlistItems.find(item => item.id === wishlistId);
        if (!wishlistItem) {
            console.warn(`⚠️ Elemento wishlist con ID ${wishlistId} non trovato`);
            return;
        }

        const recommendationsContainer = document.getElementById(`wishlist-recommendations-${wishlistId}`);
        if (!recommendationsContainer) {
            console.warn(`⚠️ Container raccomandazioni wishlist non trovato per ${wishlistId}`);
            return;
        }

        // Toggle visibilità
        if (recommendationsContainer.style.display === 'none' || !recommendationsContainer.style.display) {
            recommendationsContainer.style.display = 'block';
            
            // Genera raccomandazioni se non esistono già
            if (recommendationsContainer.innerHTML.trim() === '') {
                try {
                    console.log(`🎯 Generazione raccomandazioni wishlist per: "${wishlistItem.title}"`);
                    
                    // Usa sia i libri letti che gli altri elementi della wishlist per le raccomandazioni
                    const allAvailableItems = [...allBooks, ...allWishlistItems.filter(item => item.id !== wishlistId)];
                    
                    await bookRecommendationUI.renderRecommendations(
                        `wishlist-recommendations-${wishlistId}`, 
                        wishlistItem, 
                        allAvailableItems, 
                        {
                            showReasons: true,
                            showStats: false,
                            maxRecommendations: 3,
                            enableAnimations: true,
                            compact: true
                        }
                    );
                    
                    // Scroll smooth al container
                    setTimeout(() => {
                        recommendationsContainer.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }, 500);
                    
                } catch (error) {
                    console.error('❌ Errore nella generazione raccomandazioni wishlist:', error);
                    recommendationsContainer.innerHTML = `
                        <div style="text-align: center; padding: 1rem; color: var(--text-muted);">
                            <p>😅 Non riesco a generare raccomandazioni al momento</p>
                            <button onclick="showWishlistRecommendations('${wishlistId}')" class="btn-secondary small">
                                🔄 Riprova
                            </button>
                        </div>
                    `;
                }
            } else {
                // Se già esistono, scroll al container
                setTimeout(() => {
                    recommendationsContainer.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }, 100);
            }
        } else {
            // Nascondi raccomandazioni
            recommendationsContainer.style.display = 'none';
        }
    };
    
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
        const recommendationsSection = document.getElementById('recommendationsSection');
        const preferencesSection = document.getElementById('preferencesSection');
        const booksTabBtn = document.getElementById('booksTabBtn');
        const wishlistTabBtn = document.getElementById('wishlistTabBtn');
        const quizTabBtn = document.getElementById('quizTabBtn');
        const recommendationsTabBtn = document.getElementById('recommendationsTabBtn');
        const preferencesTabBtn = document.getElementById('preferencesTabBtn');
        
        // Nascondi tutte le sezioni
        booksSection.style.display = 'none';
        wishlistSection.style.display = 'none';
        quizSection.style.display = 'none';
        if (recommendationsSection) recommendationsSection.style.display = 'none';
        if (preferencesSection) preferencesSection.style.display = 'none';
        
        // Rimuovi active da tutti i pulsanti
        booksTabBtn.classList.remove('active');
        wishlistTabBtn.classList.remove('active');
        quizTabBtn.classList.remove('active');
        if (recommendationsTabBtn) recommendationsTabBtn.classList.remove('active');
        if (preferencesTabBtn) preferencesTabBtn.classList.remove('active');
        
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
        } else if (section === 'recommendations') {
            if (recommendationsSection) {
                recommendationsSection.style.display = 'block';
                if (recommendationsTabBtn) recommendationsTabBtn.classList.add('active');
                
                // Aggiorna le statistiche quando si entra nella sezione
                updateRecommendationStats();
            }
        } else if (section === 'preferences') {
            if (preferencesSection) {
                preferencesSection.style.display = 'block';
                if (preferencesTabBtn) preferencesTabBtn.classList.add('active');
                
                // Inizializza la sezione preferenze
                initPreferencesSection();
            }
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
                
                // Gestione trama con pulsante "Trama completa"
                let descriptionHtml = '';
                if (item.description) {
                    const isLong = item.description.length > 200;
                    const shortDescription = item.description.substring(0, 200);
                    descriptionHtml = `
                        <div class="description" style="margin-top: 0.5rem; font-style: italic;">
                            <div id="desc-short-wishlist-${item.id}" ${isLong ? '' : 'style="display: none;"'}>
                                ${escapeHtml(shortDescription)}${isLong ? '...' : ''}
                                ${isLong ? `<button onclick="toggleFullDescription('wishlist-${item.id}')" class="btn-link" style="margin-left: 0.5rem; font-size: 0.85rem; padding: 0.25rem 0.5rem; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer;">📖 Trama completa</button>` : ''}
                            </div>
                            <div id="desc-full-wishlist-${item.id}" style="display: none; color: var(--text-secondary); line-height: 1.5; background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 8px; border-left: 3px solid var(--accent-color);">
                                <strong>Trama:</strong><br>${escapeHtml(item.description)}
                                <button onclick="toggleFullDescription('wishlist-${item.id}')" class="btn-link" style="margin-top: 0.5rem; font-size: 0.85rem; padding: 0.25rem 0.5rem; background: var(--text-muted); color: white; border: none; border-radius: 4px; cursor: pointer;">➖ Riduci</button>
                            </div>
                        </div>
                    `;
                    // Se la descrizione è breve, mostra direttamente quella completa
                    if (!isLong) {
                        descriptionHtml = `<div class="small" style="margin-top: 0.5rem; font-style: italic;">${escapeHtml(item.description)}</div>`;
                    }
                }
                
                itemCard.innerHTML = `
                    <h3>${escapeHtml(item.title || 'Titolo non specificato')}</h3>
                    <div class="author">di ${escapeHtml(item.author || 'Autore sconosciuto')}</div>
                    <div class="year">${item.year || 'Anno non specificato'}</div>
                    ${priorityHtml}
                    ${priceHtml}
                    ${additionalInfo.length > 0 ? `<div class="small" style="margin-top: 0.5rem;">${additionalInfo.join(' • ')}</div>` : ''}
                    ${descriptionHtml}
                    ${notesHtml}
                    ${tagsHtml ? `<div class="tags" style="margin-top: 0.5rem;">${tagsHtml}</div>` : ''}
                    <div style="margin-top: 0.75rem;">
                        <button onclick="editWishlistItem('${item.id}')" class="btn-secondary">Modifica</button>
                        <button onclick="moveToLibrary('${item.id}')" class="btn-primary" title="Sposta nei libri letti">📚 Letto!</button>
                        <button onclick="deleteWishlistItem('${item.id}')" class="btn-danger" style="margin-left: 0.5rem;" title="Elimina dalla wishlist">🗑️ Elimina</button>
                        <button onclick="showWishlistRecommendations('${item.id}')" class="btn-primary" style="margin-left: 0.5rem; background: var(--accent-gradient);" title="Trova libri simili">✨ Simili</button>
                    </div>
                    <div id="wishlist-recommendations-${item.id}" class="book-recommendations" style="margin-top: 1rem; display: none;"></div>
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

    // ===== SISTEMA DI RACCOMANDAZIONE AVANZATO =====
    
    /**
     * Sistema di Raccomandazione Libri con TF-IDF e Machine Learning
     * Versione migliorata e integrata con Firebase
     */
    class BookRecommendationSystem {
        constructor() {
            this.stopWords = new Set([
                "il", "lo", "la", "i", "gli", "le", "un", "una", "di", "e", "a", "che", "in",
                "con", "per", "su", "da", "non", "è", "sono", "del", "della", "al", "d", "l",
                "molto", "più", "come", "anche", "solo", "prima", "dopo", "dove", "quando",
                "perché", "ma", "se", "già", "ancora", "poi", "così", "qui", "là", "questo",
                "quella", "questi", "quelle", "stesso", "stessa", "altri", "altre", "tutto",
                "tutti", "ogni", "qualche", "alcuni", "alcune", "niente", "nulla"
            ]);
            
            // Storage per feedback e cronologia utente (integrato con Firebase)
            this.userFeedback = new Map();
            this.viewHistory = new Map();
            this.userPreferences = new Map();
            
            // Cache per performance
            this.idfCache = new Map();
            this.vectorCache = new Map();
            this.lastCacheUpdate = null;
            this.cacheTimeout = 300000; // 5 minuti
            
            // Pesi per diversi fattori di raccomandazione
            this.weights = {
                similarity: 0.35,
                rating: 0.25,
                feedback: 0.20,
                popularity: 0.15,
                freshness: 0.05
            };
            
            // Firebase references
            this.db = window.firebaseDb;
            this.firebaseModules = window.firebaseModules;
            
            // ID utente per Firebase (per ora usiamo un ID fisso, in futuro si può integrare con autenticazione)
            this.userId = this.generateUserId();
            
            // Inizializza dai dati (prima localStorage come fallback, poi Firebase)
            this.loadUserDataFromStorage();
            this.loadUserDataFromFirebase();
        }
        
        // Genera un ID utente univoco (persistente nel localStorage)
        generateUserId() {
            let userId = localStorage.getItem('bookRecommendationUserId');
            if (!userId) {
                userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('bookRecommendationUserId', userId);
            }
            return userId;
        }

        // === TOKENIZZAZIONE AVANZATA ===
        tokenize(text) {
            if (!text || typeof text !== 'string') return [];
            
            return text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Rimuove accenti
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => 
                    word.length > 2 && 
                    !this.stopWords.has(word) &&
                    !/^\d+$/.test(word) // Rimuove numeri puri
                )
                .slice(0, 150); // Aumentato limite per migliore analisi
        }

        // === CALCOLO IDF CON CACHING MIGLIORATO ===
        buildIdf(allTexts) {
            if (!allTexts || allTexts.length === 0) return new Map();
            
            const cacheKey = `idf_${allTexts.length}_${JSON.stringify(allTexts.slice(0, 3).map(t => t?.slice(0, 30) || ''))}`;
            
            if (this.idfCache.has(cacheKey) && this.isCacheValid()) {
                return this.idfCache.get(cacheKey);
            }

            const documentFrequency = new Map();
            const totalDocuments = allTexts.length;

            // Calcolo frequency con ottimizzazione
            allTexts.forEach(text => {
                const uniqueTokens = new Set(this.tokenize(text));
                uniqueTokens.forEach(token => {
                    documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
                });
            });

            // Calcolo IDF con smoothing logaritmico migliorato
            const idf = new Map();
            documentFrequency.forEach((freq, token) => {
                const idfValue = Math.log((totalDocuments + 1) / (freq + 1)) + 1;
                if (idfValue > 0.1) { // Filtra termini con IDF troppo basso
                    idf.set(token, idfValue);
                }
            });

            this.idfCache.set(cacheKey, idf);
            this.lastCacheUpdate = Date.now();
            return idf;
        }

        // === CALCOLO VETTORE TF-IDF OTTIMIZZATO ===
        calculateTfIdfVector(text, idf) {
            if (!text || !idf || idf.size === 0) return new Map();
            
            const cacheKey = `vector_${text?.slice(0, 50) || ''}_${idf.size}`;
            
            if (this.vectorCache.has(cacheKey) && this.isCacheValid()) {
                return this.vectorCache.get(cacheKey);
            }

            const tokens = this.tokenize(text);
            if (tokens.length === 0) return new Map();
            
            const termFrequency = new Map();
            
            // Calcolo TF con normalizzazione
            tokens.forEach(token => {
                termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
            });

            const maxFreq = Math.max(...termFrequency.values(), 1);
            const vector = new Map();

            termFrequency.forEach((freq, term) => {
                const normalizedTf = freq / maxFreq;
                const idfValue = idf.get(term) || 0;
                if (idfValue > 0.1) { // Soglia per filtrare termini poco significativi
                    const tfidf = normalizedTf * idfValue;
                    if (tfidf > 0.01) { // Ulteriore filtro per performance
                        vector.set(term, tfidf);
                    }
                }
            });

            this.vectorCache.set(cacheKey, vector);
            return vector;
        }

        // === SIMILARITÀ COSENO OTTIMIZZATA ===
        cosineSimilarity(vectorA, vectorB) {
            if (!vectorA || !vectorB || vectorA.size === 0 || vectorB.size === 0) return 0;

            const commonKeys = [...vectorA.keys()].filter(key => vectorB.has(key));
            
            if (commonKeys.length === 0) return 0;

            let dotProduct = 0;
            let normA = 0;
            let normB = 0;

            // Calcolo ottimizzato
            vectorA.forEach((value, key) => {
                normA += value * value;
                if (vectorB.has(key)) {
                    dotProduct += value * vectorB.get(key);
                }
            });

            vectorB.forEach(value => {
                normB += value * value;
            });

            const denominator = Math.sqrt(normA * normB);
            return denominator > 0 ? Math.min(dotProduct / denominator, 1) : 0;
        }

        // === ESTRAZIONE TESTO LIBRO MIGLIORATA ===
        extractBookText(book, preferences = {}) {
            if (!book) return '';
            
            const defaultPrefs = {
                useTitle: true,
                useDescription: true,
                useGenre: true,
                useTags: true,
                useAuthor: true
            };
            
            const prefs = { ...defaultPrefs, ...preferences };
            const textParts = [];
            
            // Pesi differenziati per diversi campi
            const weights = {
                title: 4,     // Peso maggiore per il titolo
                author: 3,    // Peso alto per l'autore
                tags: 2,      // Peso medio per i tag
                genre: 2,     // Peso medio per il genere
                description: 1 // Peso base per la descrizione
            };

            if (prefs.useTitle && book.title) {
                textParts.push(book.title.repeat(weights.title));
            }
            
            if (prefs.useAuthor && book.author) {
                textParts.push(book.author.repeat(weights.author));
            }
            
            if (prefs.useTags && book.tags && Array.isArray(book.tags)) {
                const tagsText = book.tags.join(' ').repeat(weights.tags);
                textParts.push(tagsText);
            }
            
            if (prefs.useGenre && book.genre) {
                textParts.push(book.genre.repeat(weights.genre));
            }
            
            if (prefs.useDescription && book.description) {
                textParts.push(book.description);
            }

            return textParts.join(' ');
        }

        // === CALCOLO POPOLARITÀ E METRICHE ===
        calculatePopularity(book) {
            if (!book) return 0;
            
            const views = this.viewHistory.get(book.title) || 0;
            const feedback = this.userFeedback.get(book.title) || 0;
            const rating = book.rating || 0;
            
            // Formula composita per popolarità
            const popularityScore = 
                Math.log(views + 1) * 0.4 +
                Math.max(feedback, 0) * 0.3 +
                (rating / 5) * 0.3;
                
            return Math.min(popularityScore, 1); // Normalizza a [0,1]
        }
        
        calculateFreshness(book) {
            // Peso dell'anno rimosso per preferenza dell'utente
            return 1.0; // Valore neutro per tutti i libri
        }

        // === RACCOMANDAZIONI PRINCIPALI ===
        getRecommendations(selectedBook, allBooks, preferences = {}, topN = 8) {
            if (!selectedBook || !allBooks || allBooks.length === 0) return [];

            console.log(`🔍 Generazione raccomandazioni per: "${selectedBook.title}"`);
            
            // Registra visualizzazione
            this.viewHistory.set(selectedBook.title, 
                (this.viewHistory.get(selectedBook.title) || 0) + 1);

            const availableBooks = allBooks.filter(book => 
                book.title !== selectedBook.title && book.id !== selectedBook.id);
            
            if (availableBooks.length === 0) return [];
            
            // Scegli algoritmo in base alle preferenze
            const mode = preferences.mode || "hybrid";
            
            switch (mode) {
                case "content":
                    return this.getContentBasedRecommendations(selectedBook, availableBooks, topN);
                case "style":
                    return this.getStyleBasedRecommendations(selectedBook, availableBooks, preferences, topN);
                case "hybrid":
                default:
                    return this.getHybridRecommendations(selectedBook, availableBooks, preferences, topN);
            }
        }

        // === RACCOMANDAZIONI IBRIDE (MIGLIORI) ===
        getHybridRecommendations(selectedBook, books, preferences, topN) {
            const contentRecs = this.getContentBasedRecommendations(selectedBook, books, topN * 2);
            const styleRecs = this.getStyleBasedRecommendations(selectedBook, books, preferences, topN * 2);
            
            // Combina e pondera i risultati
            const combinedScores = new Map();
            
            contentRecs.forEach(rec => {
                const key = rec.book.title;
                if (!combinedScores.has(key)) {
                    combinedScores.set(key, { ...rec, combinedScore: 0 });
                }
                combinedScores.get(key).combinedScore += rec.score * 0.4;
            });
            
            styleRecs.forEach(rec => {
                const key = rec.book.title;
                if (!combinedScores.has(key)) {
                    combinedScores.set(key, { ...rec, combinedScore: 0 });
                }
                combinedScores.get(key).combinedScore += rec.score * 0.6;
                
                // Aggiungi informazioni di stile se non presenti
                const existing = combinedScores.get(key);
                if (!existing.similarity && rec.similarity) {
                    existing.similarity = rec.similarity;
                    existing.commonWords = rec.commonWords;
                }
            });
            
            return Array.from(combinedScores.values())
                .sort((a, b) => b.combinedScore - a.combinedScore)
                .slice(0, topN)
                .map(rec => ({
                    ...rec,
                    score: rec.combinedScore,
                    method: 'hybrid'
                }));
        }

        // === RACCOMANDAZIONI BASATE SUL CONTENUTO ===
        getContentBasedRecommendations(selectedBook, books, topN) {
            return books.map(book => {
                let score = 0;
                const reasons = [];

                // Stesso genere/tag
                const commonTags = this.getCommonTags(selectedBook, book);
                if (commonTags.length > 0) {
                    const tagScore = Math.min(commonTags.length * 0.2, 0.6);
                    score += tagScore;
                    reasons.push(`Tag comuni: ${commonTags.slice(0, 3).join(', ')}`);
                }

                // Stesso autore
                if (book.author && selectedBook.author && 
                    book.author.toLowerCase() === selectedBook.author.toLowerCase()) {
                    score += 0.7;
                    reasons.push(`Stesso autore: ${book.author}`);
                }

                // Rating del libro
                if (book.rating && book.rating >= 4) {
                    score += 0.15;
                    reasons.push(`Libro ben valutato (${book.rating}/5)`);
                }

                // Feedback utente precedente
                const feedback = this.userFeedback.get(book.title) || 0;
                if (feedback > 0) {
                    score += feedback * 0.2;
                    reasons.push('Ti è piaciuto in precedenza');
                }

                // Popolarità
                const popularity = this.calculatePopularity(book);
                score += popularity * this.weights.popularity;

                return {
                    book,
                    score,
                    reasons,
                    commonWords: [],
                    method: 'content'
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);
        }

        // === RACCOMANDAZIONI BASATE SULLO STILE ===
        getStyleBasedRecommendations(selectedBook, books, preferences, topN) {
            const allTexts = [selectedBook, ...books].map(book => 
                this.extractBookText(book, preferences));
            
            const idf = this.buildIdf(allTexts);
            const selectedVector = this.calculateTfIdfVector(
                this.extractBookText(selectedBook, preferences), idf);

            if (selectedVector.size === 0) {
                console.warn('⚠️ Vettore vuoto per il libro selezionato, fallback a content-based');
                return this.getContentBasedRecommendations(selectedBook, books, topN);
            }

            const recommendations = books.map(book => {
                const bookText = this.extractBookText(book, preferences);
                const bookVector = this.calculateTfIdfVector(bookText, idf);
                
                const similarity = this.cosineSimilarity(selectedVector, bookVector);
                const feedback = this.userFeedback.get(book.title) || 0;
                const popularity = this.calculatePopularity(book);
                const freshness = this.calculateFreshness(book);
                const ratingScore = book.rating ? (book.rating / 5) : 0.5;
                
                // Score composito con pesi calibrati
                const finalScore = 
                    similarity * this.weights.similarity +
                    feedback * this.weights.feedback +
                    popularity * this.weights.popularity +
                    freshness * this.weights.freshness +
                    ratingScore * this.weights.rating;

                const commonWords = [...selectedVector.keys()]
                    .filter(term => bookVector.has(term))
                    .sort((a, b) => (bookVector.get(b) || 0) - (bookVector.get(a) || 0))
                    .slice(0, 12);

                return {
                    book,
                    score: Math.min(finalScore, 1),
                    similarity,
                    commonWords,
                    reasons: this.generateReasons(book, selectedBook, similarity, commonWords),
                    method: 'style'
                };
            })
            .filter(rec => rec.similarity > 0.05) // Filtra similarità troppo basse
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);

            return recommendations;
        }
        
        // === UTILITÀ PER CONFRONTI ===
        getCommonTags(book1, book2) {
            if (!book1.tags || !book2.tags) return [];
            
            const tags1 = book1.tags.map(tag => tag.toLowerCase());
            const tags2 = book2.tags.map(tag => tag.toLowerCase());
            
            return tags1.filter(tag => tags2.includes(tag));
        }

        // === GENERAZIONE MOTIVI MIGLIORATA ===
        generateReasons(book, selectedBook, similarity, commonWords) {
            const reasons = [];
            
            if (similarity > 0.4) {
                reasons.push(`Altissima affinità stilistica (${(similarity * 100).toFixed(1)}%)`);
            } else if (similarity > 0.25) {
                reasons.push(`Buona affinità stilistica (${(similarity * 100).toFixed(1)}%)`);
            } else if (similarity > 0.1) {
                reasons.push(`Stile simile (${(similarity * 100).toFixed(1)}%)`);
            }
            
            // Tag/generi comuni
            const commonTags = this.getCommonTags(selectedBook, book);
            if (commonTags.length > 0) {
                reasons.push(`Temi comuni: ${commonTags.slice(0, 2).join(', ')}`);
            }
            
            // Stesso autore
            if (book.author && selectedBook.author && 
                book.author.toLowerCase() === selectedBook.author.toLowerCase()) {
                reasons.push(`Dello stesso autore: ${book.author}`);
            }
            
            // Parole chiave importanti
            if (commonWords.length > 5) {
                const topWords = commonWords.slice(0, 3).filter(word => word.length > 3);
                if (topWords.length > 0) {
                    reasons.push(`Concetti chiave: ${topWords.join(', ')}`);
                }
            }

            // Rating alto
            if (book.rating && book.rating >= 4) {
                reasons.push(`Libro molto apprezzato (${book.rating}/5 stelle)`);
            }

            // Feedback positivo precedente
            const feedback = this.userFeedback.get(book.title) || 0;
            if (feedback > 0.5) {
                reasons.push('Ti è piaciuto in precedenza');
            }

            return reasons.slice(0, 4); // Limita a 4 motivi per non appesantire l'UI
        }

        // === GESTIONE FEEDBACK MIGLIORATA ===
        updateFeedback(bookTitle, rating) {
            if (!bookTitle || typeof rating !== 'number' || rating < -1 || rating > 1) {
                throw new Error('Rating deve essere un numero tra -1 e 1');
            }
            
            const currentFeedback = this.userFeedback.get(bookTitle) || 0;
            const decayFactor = 0.85; // Leggero decadimento per feedback precedenti
            const newFeedback = currentFeedback * decayFactor + rating;
            
            this.userFeedback.set(bookTitle, Math.max(-2, Math.min(2, newFeedback)));
            
            // Salva nel localStorage
            this.saveUserDataToStorage();
            
            // Invalida cache
            this.invalidateCache();
            
            console.log(`💡 Feedback aggiornato per "${bookTitle}": ${newFeedback.toFixed(2)}`);
        }

        // === GESTIONE CACHE ===
        isCacheValid() {
            return this.lastCacheUpdate && 
                   (Date.now() - this.lastCacheUpdate) < this.cacheTimeout;
        }

        invalidateCache() {
            this.vectorCache.clear();
            this.idfCache.clear();
            this.lastCacheUpdate = null;
            console.log('🗑️ Cache invalidata');
        }

        // === PERSISTENZA DATI UTENTE CON FIREBASE ===
        async saveUserDataToFirebase() {
            if (!this.db || !this.firebaseModules) {
                console.warn('⚠️ Firebase non disponibile, uso localStorage come fallback');
                this.saveUserDataToStorage();
                return;
            }
            
            try {
                const { doc, setDoc, serverTimestamp } = this.firebaseModules;
                
                const userData = {
                    feedback: Object.fromEntries(this.userFeedback),
                    viewHistory: Object.fromEntries(this.viewHistory),
                    preferences: Object.fromEntries(this.userPreferences),
                    timestamp: serverTimestamp(),
                    lastUpdate: Date.now()
                };
                
                const userDocRef = doc(this.db, 'userPreferences', this.userId);
                await setDoc(userDocRef, userData, { merge: true });
                
                console.log('✅ Dati utente salvati su Firebase');
                
                // Salva anche nel localStorage come backup
                this.saveUserDataToStorage();
            } catch (error) {
                console.warn('⚠️ Impossibile salvare su Firebase, uso localStorage:', error);
                this.saveUserDataToStorage();
            }
        }
        
        async loadUserDataFromFirebase() {
            if (!this.db || !this.firebaseModules) {
                console.warn('⚠️ Firebase non disponibile, uso solo localStorage');
                return;
            }
            
            try {
                const { doc, getDoc } = this.firebaseModules;
                
                const userDocRef = doc(this.db, 'userPreferences', this.userId);
                const docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    
                    // Carica feedback
                    if (userData.feedback) {
                        this.userFeedback = new Map(Object.entries(userData.feedback));
                    }
                    
                    // Carica cronologia visualizzazioni
                    if (userData.viewHistory) {
                        this.viewHistory = new Map(Object.entries(userData.viewHistory));
                    }
                    
                    // Carica preferenze utente
                    if (userData.preferences) {
                        this.userPreferences = new Map(Object.entries(userData.preferences));
                    }
                    
                    console.log('✅ Dati utente caricati da Firebase');
                    console.log(`📊 Statistiche: ${this.userFeedback.size} feedback, ${this.viewHistory.size} visualizzazioni, ${this.userPreferences.size} preferenze`);
                    
                    // Salva anche nel localStorage per cache locale
                    this.saveUserDataToStorage();
                } else {
                    console.log('💡 Nessun dato utente trovato su Firebase, utilizzo dati locali');
                }
            } catch (error) {
                console.warn('⚠️ Impossibile caricare da Firebase:', error);
            }
        }

        saveUserDataToStorage() {
            try {
                const userData = {
                    feedback: Object.fromEntries(this.userFeedback),
                    viewHistory: Object.fromEntries(this.viewHistory),
                    preferences: Object.fromEntries(this.userPreferences),
                    timestamp: Date.now(),
                    userId: this.userId
                };
                localStorage.setItem('bookRecommendationData', JSON.stringify(userData));
            } catch (error) {
                console.warn('⚠️ Impossibile salvare dati utente:', error);
            }
        }

        loadUserDataFromStorage() {
            try {
                const stored = localStorage.getItem('bookRecommendationData');
                if (stored) {
                    const userData = JSON.parse(stored);
                    
                    if (userData.feedback) {
                        this.userFeedback = new Map(Object.entries(userData.feedback));
                    }
                    if (userData.viewHistory) {
                        this.viewHistory = new Map(Object.entries(userData.viewHistory));
                    }
                    if (userData.preferences) {
                        this.userPreferences = new Map(Object.entries(userData.preferences));
                    }
                    
                    console.log('✅ Dati utente caricati dal localStorage');
                }
            } catch (error) {
                console.warn('⚠️ Impossibile caricare dati utente:', error);
            }
        }

        // === GESTIONE PREFERENZE UTENTE ===
        async setUserPreference(key, value) {
            this.userPreferences.set(key, value);
            await this.saveUserDataToFirebase();
            console.log(`✅ Preferenza salvata: ${key} = ${value}`);
        }
        
        getUserPreference(key, defaultValue = null) {
            return this.userPreferences.get(key) || defaultValue;
        }
        
        async removeUserPreference(key) {
            this.userPreferences.delete(key);
            await this.saveUserDataToFirebase();
            console.log(`🗑️ Preferenza rimossa: ${key}`);
        }
        
        // === FEEDBACK E INTERAZIONI UTENTE ===
        async recordBookFeedback(bookTitle, rating) {
            // Rating: -1 = dislike, 0 = neutral, 1 = like
            this.userFeedback.set(bookTitle, rating);
            await this.saveUserDataToFirebase();
            console.log(`📊 Feedback registrato: ${bookTitle} = ${rating}`);
        }
        
        async recordBookView(bookTitle) {
            const currentViews = this.viewHistory.get(bookTitle) || 0;
            this.viewHistory.set(bookTitle, currentViews + 1);
            await this.saveUserDataToFirebase();
        }
        
        // === ANALISI PREFERENZE AUTOMATICHE ===
        async analyzeUserPreferences() {
            const analysis = {
                favoriteGenres: this.extractFavoriteGenres(),
                preferredAuthors: this.extractPreferredAuthors(),
                bookLengthPreference: this.extractLengthPreference(),
                yearPreference: this.extractYearPreference(),
                readingPatterns: this.extractReadingPatterns()
            };
            
            // Salva le preferenze analizzate
            await this.setUserPreference('autoAnalysis', analysis);
            await this.setUserPreference('lastAnalysis', Date.now());
            
            console.log('🔍 Analisi preferenze completata:', analysis);
            return analysis;
        }
        
        extractFavoriteGenres() {
            const genreScores = new Map();
            
            // Analizza i feedback positivi per estrarre generi preferiti
            for (const [title, rating] of this.userFeedback) {
                if (rating > 0) {
                    const book = allBooks.find(b => b.title === title);
                    if (book && book.tags) {
                        book.tags.forEach(tag => {
                            const current = genreScores.get(tag) || 0;
                            genreScores.set(tag, current + rating);
                        });
                    }
                }
            }
            
            return Array.from(genreScores.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([genre, score]) => ({ genre, score }));
        }
        
        extractPreferredAuthors() {
            const authorScores = new Map();
            
            for (const [title, rating] of this.userFeedback) {
                if (rating > 0) {
                    const book = allBooks.find(b => b.title === title);
                    if (book && book.author) {
                        const current = authorScores.get(book.author) || 0;
                        authorScores.set(book.author, current + rating);
                    }
                }
            }
            
            return Array.from(authorScores.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([author, score]) => ({ author, score }));
        }
        
        extractLengthPreference() {
            const lengthFeedback = [];
            
            for (const [title, rating] of this.userFeedback) {
                const book = allBooks.find(b => b.title === title);
                if (book && book.pages && rating !== 0) {
                    lengthFeedback.push({ pages: book.pages, rating });
                }
            }
            
            if (lengthFeedback.length === 0) return null;
            
            const avgPages = lengthFeedback
                .filter(item => item.rating > 0)
                .reduce((sum, item) => sum + item.pages, 0) / lengthFeedback.filter(item => item.rating > 0).length;
                
            return Math.round(avgPages) || null;
        }
        
        extractYearPreference() {
            const yearFeedback = [];
            
            for (const [title, rating] of this.userFeedback) {
                const book = allBooks.find(b => b.title === title);
                if (book && book.year && rating > 0) {
                    yearFeedback.push(book.year);
                }
            }
            
            if (yearFeedback.length === 0) return null;
            
            // Calcola l'anno medio preferito
            const avgYear = yearFeedback.reduce((sum, year) => sum + year, 0) / yearFeedback.length;
            return Math.round(avgYear);
        }
        
        extractReadingPatterns() {
            const patterns = {
                totalInteractions: this.userFeedback.size,
                positiveRatings: Array.from(this.userFeedback.values()).filter(r => r > 0).length,
                negativeRatings: Array.from(this.userFeedback.values()).filter(r => r < 0).length,
                mostViewedBooks: Array.from(this.viewHistory.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([title, views]) => ({ title, views }))
            };
            
            patterns.positivityRate = patterns.totalInteractions > 0 ? 
                patterns.positiveRatings / patterns.totalInteractions : 0;
                
            return patterns;
        }

        // === STATISTICHE E DEBUG ===
        getStats() {
            return {
                feedbackEntries: this.userFeedback.size,
                viewHistory: this.viewHistory.size,
                preferences: this.userPreferences.size,
                userId: this.userId,
                cacheSize: this.vectorCache.size + this.idfCache.size,
                lastCacheUpdate: this.lastCacheUpdate,
                totalViews: Array.from(this.viewHistory.values()).reduce((sum, views) => sum + views, 0)
            };
        }

        // === ESPORTAZIONE/IMPORTAZIONE ===
        exportUserData() {
            return {
                feedback: Object.fromEntries(this.userFeedback),
                viewHistory: Object.fromEntries(this.viewHistory),
                preferences: Object.fromEntries(this.userPreferences),
                userId: this.userId,
                timestamp: Date.now(),
                version: "2.1"
            };
        }

        async importUserData(data) {
            try {
                if (data.feedback) {
                    this.userFeedback = new Map(Object.entries(data.feedback));
                }
                if (data.viewHistory) {
                    this.viewHistory = new Map(Object.entries(data.viewHistory));
                }
                if (data.preferences) {
                    this.userPreferences = new Map(Object.entries(data.preferences));
                }
                
                await this.saveUserDataToFirebase();
                this.invalidateCache();
                console.log('✅ Dati utente importati con successo');
            } catch (error) {
                console.error('❌ Errore nell\'importazione dati:', error);
            }
        }

        // === RESET DATI ===
        async resetUserData() {
            this.userFeedback.clear();
            this.viewHistory.clear();
            this.userPreferences.clear();
            this.invalidateCache();
            
            // Rimuovi da Firebase
            if (this.db && this.firebaseModules) {
                try {
                    const { doc, deleteDoc } = this.firebaseModules;
                    const userDocRef = doc(this.db, 'userPreferences', this.userId);
                    await deleteDoc(userDocRef);
                    console.log('🔄 Dati utente rimossi da Firebase');
                } catch (error) {
                    console.warn('⚠️ Impossibile rimuovere dati da Firebase:', error);
                }
            }
            
            // Rimuovi da localStorage
            localStorage.removeItem('bookRecommendationData');
            console.log('🔄 Dati utente resettati completamente');
        }
        
        // === SINCRONIZZAZIONE DATI ===
        async syncWithFirebase() {
            console.log('🔄 Sincronizzazione con Firebase...');
            await this.loadUserDataFromFirebase();
            await this.saveUserDataToFirebase();
            console.log('✅ Sincronizzazione completata');
        }
    }

    // Inizializza il sistema di raccomandazione
    const bookRecommendationSystem = new BookRecommendationSystem();

    // === INTERFACCIA SISTEMA DI RACCOMANDAZIONE ===
    class BookRecommendationUI {
        constructor(recommendationSystem) {
            this.system = recommendationSystem;
            this.animationDuration = 300;
            this.currentRecommendations = [];
        }

        getSimilarityPreferences() {
            return {
                useTitle: document.getElementById("useTitle")?.checked ?? true,
                useDescription: document.getElementById("useDescription")?.checked ?? true,
                useGenre: document.getElementById("useGenre")?.checked ?? true,
                useTags: document.getElementById("useTags")?.checked ?? true,
                useAuthor: document.getElementById("useAuthor")?.checked ?? true,
                mode: document.querySelector('input[name="recommendationMode"]:checked')?.value ?? "hybrid"
            };
        }

        async renderRecommendations(containerId, selectedBook, allBooks, options = {}) {
            const container = document.getElementById(containerId);
            if (!container || !selectedBook) {
                console.warn('⚠️ Container o libro selezionato non validi');
                return;
            }

            const {
                showReasons = true,
                showStats = false,
                maxRecommendations = 6,
                enableAnimations = true,
                compact = false
            } = options;

            // Mostra loading elegante
            container.innerHTML = `
                <div class="loading recommendation-loading">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                        <div style="
                            width: 40px; 
                            height: 40px; 
                            border: 3px solid #f3f3f3; 
                            border-top: 3px solid var(--primary-color); 
                            border-radius: 50%; 
                            animation: spin 1s linear infinite;
                        "></div>
                        <div>
                            <h4>🤖 Analisi in corso...</h4>
                            <p>Sto cercando libri perfetti per te</p>
                        </div>
                    </div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;

            try {
                const preferences = this.getSimilarityPreferences();
                console.log('🎯 Preferenze raccomandazione:', preferences);
                
                const recommendations = this.system.getRecommendations(
                    selectedBook, allBooks, preferences, maxRecommendations);

                this.currentRecommendations = recommendations;

                await this.animateRecommendations(
                    container, recommendations, enableAnimations, showReasons, showStats, compact);

            } catch (error) {
                console.error('❌ Errore nella generazione raccomandazioni:', error);
                container.innerHTML = `
                    <div class="error recommendation-error">
                        <div style="text-align: center; padding: 2rem;">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">😕</div>
                            <h3>Oops! Qualcosa è andato storto</h3>
                            <p>Non sono riuscito a generare le raccomandazioni per questo libro.</p>
                            <p><small>${error.message}</small></p>
                            <button onclick="bookRecommendationUI.renderRecommendations('${containerId}', arguments[1], arguments[2])" 
                                    style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-gradient); color: white; border: none; border-radius: 8px;">
                                🔄 Riprova
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        async animateRecommendations(container, recommendations, enableAnimations, showReasons, showStats, compact) {
            const html = this.generateRecommendationsHTML(recommendations, showReasons, showStats, compact);
            
            if (enableAnimations && recommendations.length > 0) {
                container.style.opacity = '0';
                container.innerHTML = html;
                
                // Fade in
                await new Promise(resolve => {
                    container.style.transition = `opacity ${this.animationDuration}ms ease`;
                    container.style.opacity = '1';
                    setTimeout(resolve, this.animationDuration);
                });
                
                // Anima ogni card con delay scalato
                const cards = container.querySelectorAll('.recommendation-card');
                cards.forEach((card, index) => {
                    card.style.transform = 'translateY(30px)';
                    card.style.opacity = '0';
                    
                    setTimeout(() => {
                        card.style.transition = 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)';
                        card.style.transform = 'translateY(0)';
                        card.style.opacity = '1';
                    }, index * 80 + 100);
                });
                
            } else {
                container.innerHTML = html;
            }

            this.attachEventListeners(container);
        }

        generateRecommendationsHTML(recommendations, showReasons, showStats, compact) {
            if (!recommendations || recommendations.length === 0) {
                return `
                    <div class="no-recommendations" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">📚</div>
                        <h3>Nessuna raccomandazione al momento</h3>
                        <p>Non ho trovato libri simili nella tua biblioteca.</p>
                        <p><small>Prova ad aggiungere più libri per ottenere raccomandazioni migliori!</small></p>
                    </div>
                `;
            }

            let html = `
                <div class="recommendations-header" style="margin-bottom: 1.5rem; text-align: center;">
                    <h3 style="margin: 0; color: var(--text-primary);">
                        ✨ Ti potrebbe interessare anche
                    </h3>
                    <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.95rem;">
                        Basato su: ${recommendations[0]?.method === 'hybrid' ? 'analisi ibrida' : 
                                      recommendations[0]?.method === 'style' ? 'stile e contenuto' : 'contenuto'}
                    </p>
                </div>
            `;

            recommendations.forEach(({ book, score, similarity, commonWords, reasons, method }, index) => {
                const scorePercentage = Math.round(score * 100);
                const similarityPercentage = similarity ? Math.round(similarity * 100) : null;
                
                // Crea descrizione troncata se in modalità compatta
                const displayDescription = compact && book.description ? 
                    (book.description.length > 120 ? book.description.substring(0, 120) + '...' : book.description) :
                    book.description;

                const highlightedDescription = this.highlightCommonWords(displayDescription || '', commonWords || []);

                html += `
                    <div class="recommendation-card" data-book-title="${escapeHtml(book.title)}" data-book-id="${book.id || ''}" data-index="${index}"
                         data-book-author="${escapeHtml(book.author || '')}" data-book-year="${book.year || ''}"
                         style="
                            background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(247,250,252,0.9) 100%);
                            border-radius: 16px;
                            padding: 1.5rem;
                            margin-bottom: 1rem;
                            border: 1px solid rgba(255,255,255,0.3);
                            box-shadow: var(--shadow-md);
                            transition: all 0.3s ease;
                            position: relative;
                            overflow: hidden;
                         "
                         onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-lg)';"
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-md)';">
                        
                        <div style="position: absolute; top: 0; right: 0; background: var(--primary-gradient); color: white; 
                                    padding: 0.25rem 0.75rem; border-radius: 0 16px 0 16px; font-size: 0.85rem; font-weight: 600;">
                            ${scorePercentage}% match
                        </div>
                        
                        <div class="book-header" style="margin: 2rem 0 1rem 0; padding-right: 4rem;">
                            <h4 style="margin: 0 0 0.25rem 0; color: var(--text-primary); font-size: 1.1rem; line-height: 1.3;">
                                ${escapeHtml(book.title)}
                            </h4>
                            ${book.author ? `
                                <p style="margin: 0; color: var(--text-secondary); font-weight: 500; font-size: 0.95rem;">
                                    di <strong>${escapeHtml(book.author)}</strong>
                                    ${book.year ? `<span style="color: var(--text-muted);"> • ${book.year}</span>` : ''}
                                </p>
                            ` : ''}
                        </div>
                        
                        <div class="book-content">
                            ${displayDescription ? `
                                <div style="margin-bottom: 1rem;">
                                    <p style="color: var(--text-secondary); line-height: 1.5; margin: 0; font-size: 0.9rem;">
                                        ${highlightedDescription}
                                    </p>
                                </div>
                            ` : ''}
                            
                            ${book.tags && book.tags.length > 0 ? `
                                <div style="margin-bottom: 1rem;">
                                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                        ${book.tags.slice(0, 5).map(tag => `
                                            <span style="
                                                background: var(--accent-gradient);
                                                color: white;
                                                padding: 0.25rem 0.75rem;
                                                border-radius: 12px;
                                                font-size: 0.8rem;
                                                font-weight: 500;
                                            ">${escapeHtml(tag)}</span>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${showReasons && reasons && reasons.length > 0 ? `
                                <div class="recommendation-reasons" style="
                                    background: rgba(102, 126, 234, 0.1);
                                    border-radius: 8px;
                                    padding: 1rem;
                                    margin-bottom: 1rem;
                                ">
                                    <div style="font-weight: 600; color: var(--primary-color); margin-bottom: 0.5rem; font-size: 0.9rem;">
                                        💡 Perché te lo consiglio:
                                    </div>
                                    <ul style="margin: 0; padding-left: 1.2rem; color: var(--text-secondary); font-size: 0.85rem;">
                                        ${reasons.slice(0, 3).map(reason => `<li style="margin-bottom: 0.25rem;">${reason}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            <div class="book-stats" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
                                <div>
                                    ${similarityPercentage !== null ? `Similarità: ${similarityPercentage}%` : ''}
                                    ${book.rating ? ` • Rating: ${book.rating}/5 ⭐` : ''}
                                </div>
                                <div>
                                    ${commonWords && commonWords.length > 0 ? `${commonWords.length} parole chiave` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="feedback-buttons" style="
                            display: flex; 
                            gap: 0.75rem; 
                            justify-content: center;
                            flex-wrap: wrap;
                        ">
                            <button class="feedback-btn like-btn" data-rating="0.8" style="
                                padding: 0.5rem 1rem;
                                border: 2px solid #10b981;
                                background: transparent;
                                color: #10b981;
                                border-radius: 20px;
                                font-size: 0.85rem;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                👍 Mi interessa
                            </button>
                            <button class="feedback-btn neutral-btn" data-rating="0" style="
                                padding: 0.5rem 1rem;
                                border: 2px solid #6b7280;
                                background: transparent;
                                color: #6b7280;
                                border-radius: 20px;
                                font-size: 0.85rem;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                ➖ Neutrale
                            </button>
                            <button class="feedback-btn dislike-btn" data-rating="-0.5" style="
                                padding: 0.5rem 1rem;
                                border: 2px solid #ef4444;
                                background: transparent;
                                color: #ef4444;
                                border-radius: 20px;
                                font-size: 0.85rem;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                👎 Non mi interessa
                            </button>
                        </div>
                    </div>
                `;
            });

            if (showStats) {
                const stats = this.system.getStats();
                html += `
                    <div class="system-stats" style="
                        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
                        border-radius: 12px;
                        padding: 1.5rem;
                        margin-top: 2rem;
                        border: 1px solid rgba(102, 126, 234, 0.2);
                    ">
                        <h4 style="margin: 0 0 1rem 0; color: var(--primary-color);">📊 Statistiche Sistema</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; font-size: 0.9rem;">
                            <div style="text-align: center;">
                                <div style="font-weight: 600; color: var(--text-primary); font-size: 1.2rem;">${stats.feedbackEntries}</div>
                                <div style="color: var(--text-muted);">Feedback</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-weight: 600; color: var(--text-primary); font-size: 1.2rem;">${stats.viewHistory}</div>
                                <div style="color: var(--text-muted);">Libri visti</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-weight: 600; color: var(--text-primary); font-size: 1.2rem;">${stats.totalViews}</div>
                                <div style="color: var(--text-muted);">Visualizzazioni</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-weight: 600; color: var(--text-primary); font-size: 1.2rem;">${stats.cacheSize > 0 ? 'Attiva' : 'Off'}</div>
                                <div style="color: var(--text-muted);">Cache</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            return html;
        }

        highlightCommonWords(text, commonWords) {
            if (!text || !commonWords || commonWords.length === 0) return text;

            let highlightedText = text;
            const wordsToHighlight = commonWords.slice(0, 8).filter(word => word.length > 3);
            
            wordsToHighlight.forEach(word => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                highlightedText = highlightedText.replace(regex, 
                    `<mark style="background: linear-gradient(135deg, #fbbf24, #f59e0b); padding: 0.1rem 0.25rem; border-radius: 3px; font-weight: 500;">${word}</mark>`
                );
            });
            
            return highlightedText;
        }

        attachEventListeners(container) {
            // Hover effects per le card
            container.querySelectorAll('.recommendation-card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    card.style.transform = 'translateY(-4px)';
                    card.style.boxShadow = 'var(--shadow-xl)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'translateY(0)';
                    card.style.boxShadow = 'var(--shadow-md)';
                });
            });

            // Gestione feedback buttons
            container.addEventListener('click', (event) => {
                if (event.target.classList.contains('feedback-btn')) {
                    event.preventDefault();
                    event.stopPropagation(); // Ferma la propagazione per evitare l'apertura dei dettagli
                    
                    const card = event.target.closest('.recommendation-card');
                    const bookTitle = card.dataset.bookTitle;
                    const rating = parseFloat(event.target.dataset.rating);
                    
                    this.handleFeedback(card, bookTitle, rating, event.target);
                }
            });

            // Hover effects per i bottoni
            container.querySelectorAll('.feedback-btn').forEach(btn => {
                const originalBg = btn.style.background;
                const borderColor = btn.style.borderColor;
                
                btn.addEventListener('mouseenter', () => {
                    btn.style.background = borderColor;
                    btn.style.color = 'white';
                    btn.style.transform = 'translateY(-2px)';
                });
                
                btn.addEventListener('mouseleave', () => {
                    if (!btn.classList.contains('feedback-given')) {
                        btn.style.background = originalBg;
                        btn.style.color = borderColor;
                        btn.style.transform = 'translateY(0)';
                    }
                });
            });
        }

        async handleFeedback(card, bookTitle, rating, button) {
            try {
                this.system.updateFeedback(bookTitle, rating);
                
                // Feedback visuale immediato
                card.classList.add('feedback-submitted');
                
                // Aggiorna stato bottoni
                const allButtons = card.querySelectorAll('.feedback-btn');
                allButtons.forEach(btn => {
                    btn.classList.remove('feedback-given');
                    const borderColor = btn.style.borderColor;
                    btn.style.background = 'transparent';
                    btn.style.color = borderColor;
                });
                
                button.classList.add('feedback-given');
                button.style.background = button.style.borderColor;
                button.style.color = 'white';
                
                // Notifica elegante
                const feedbackText = {
                    '0.8': '✅ Perfetto! Terrò conto che ti piacciono libri simili',
                    '0': '📝 Feedback neutrale registrato',
                    '-0.5': '🚫 Capito! Eviterò raccomandazioni simili'
                };
                
                this.showFeedbackNotification(card, feedbackText[rating.toString()]);
                
                // Vibrazione leggera su dispositivi mobili
                if ('vibrate' in navigator) {
                    navigator.vibrate(50);
                }
                
            } catch (error) {
                console.error('❌ Errore nel salvare feedback:', error);
                this.showFeedbackNotification(card, '❌ Errore nel salvare il feedback', 'error');
            }
        }

        showFeedbackNotification(card, message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = `feedback-notification ${type}`;
            notification.style.cssText = `
                position: absolute;
                top: 1rem;
                left: 1rem;
                right: 1rem;
                background: ${type === 'error' ? 'var(--danger-color)' : 'var(--success-color)'};
                color: white;
                padding: 0.75rem;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 500;
                text-align: center;
                box-shadow: var(--shadow-lg);
                z-index: 10;
                opacity: 0;
                transform: translateY(-10px);
                transition: all 0.3s ease;
            `;
            notification.textContent = message;
            
            card.style.position = 'relative';
            card.appendChild(notification);
            
            // Animazione di entrata
            setTimeout(() => {
                notification.style.opacity = '1';
                notification.style.transform = 'translateY(0)';
            }, 10);
            
            // Rimozione automatica
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                    card.classList.remove('feedback-submitted');
                }, 300);
            }, 2000);
        }
    }

    // Inizializza l'interfaccia di raccomandazione
    const bookRecommendationUI = new BookRecommendationUI(bookRecommendationSystem);

    // Esponi globalmente per compatibilità
    window.bookRecommendationSystem = bookRecommendationSystem;
    window.bookRecommendationUI = bookRecommendationUI;
    
    // Inizializza le preferenze utente e la sincronizzazione automatica
    setTimeout(async () => {
        await initializeUserPreferences();
        setupAutoSync();
    }, 1000);
    
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
        
        // Mostra messaggio di caricamento
        document.getElementById('quizIntro').style.display = 'none';
        document.getElementById('quizQuestions').innerHTML = `
            <div class="loading-quiz">
                <h3>🤖 L'IA sta preparando il tuo quiz personalizzato...</h3>
                <p>Sto analizzando la tua biblioteca e creando domande su misura per te.</p>
                <div style="margin: 2rem 0;">
                    <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
                        <div style="width: 0%; height: 100%; background: var(--primary-gradient); animation: loadingBar 3s ease-in-out infinite;"></div>
                    </div>
                </div>
                <p><small>Questo potrebbe richiedere qualche secondo...</small></p>
            </div>
            <style>
                @keyframes loadingBar {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 100%; }
                }
            </style>
        `;
        document.getElementById('quizQuestions').style.display = 'block';
        
        try {
            // Genera le domande del quiz tramite IA
            await generateQuizQuestions();
            
            // Inizializza il quiz dopo la generazione
            currentQuestionIndex = 0;
            quizAnswers = {};
            
            document.getElementById('quizNavigation').style.display = 'flex';
            renderCurrentQuestion();
            updateProgress();
            
        } catch (error) {
            console.error('❌ Errore nell\'avvio del quiz:', error);
            document.getElementById('quizQuestions').innerHTML = `
                <div class="api-error">
                    <h3>❌ Errore nella generazione del quiz</h3>
                    <p>Si è verificato un problema durante la creazione del quiz personalizzato.</p>
                    <p>Riprova tra qualche istante o contatta il supporto se il problema persiste.</p>
                    <button onclick="showSection('quiz')" class="btn-primary" style="margin-top: 1rem;">
                        🔄 Riprova
                    </button>
                </div>
            `;
        }
    };
    
    // ---- Generazione domande quiz ----
    async function generateQuizQuestions() {
        try {
            console.log("🤖 Generazione domande quiz tramite IA...");
            
            // Raccogli informazioni dalla libreria per il contesto
            const libraryInfo = {
                totalBooks: allBooks.length,
                authors: [...new Set(allBooks.map(book => book.author).filter(Boolean))].slice(0, 10),
                tags: [...new Set(allBooks.flatMap(book => book.tags || []))].slice(0, 15),
                genres: [...new Set(allBooks.flatMap(book => book.tags || []).filter(tag => 
                    ['fantasy', 'fantascienza', 'thriller', 'giallo', 'romantico', 'storico', 'biografia', 'saggistica', 'classici', 'contemporaneo'].some(genre => 
                        tag.toLowerCase().includes(genre)
                    )
                ))].slice(0, 10),
                averageYear: allBooks.length > 0 ? Math.round(allBooks.filter(book => book.year).map(book => book.year).reduce((a, b) => a + b, 0) / allBooks.filter(book => book.year).length) || 2020 : 2020,
                hasRatings: allBooks.some(book => book.rating),
                mostCommonTags: [...new Set(allBooks.flatMap(book => book.tags || []))].slice(0, 8)
            };
            
            const prompt = `
Sei un esperto letterario e devi creare un quiz personalizzato per raccomandare libri. 
Genera ESATTAMENTE 6-8 domande creative e interessanti per capire i gusti letterari dell'utente.

CONTESTO BIBLIOTECA UTENTE:
- Libri totali: ${libraryInfo.totalBooks}
- Autori principali: ${libraryInfo.authors.join(', ') || 'Nessuno'}
- Tag/Generi: ${libraryInfo.tags.join(', ') || 'Nessuno'}
- Anno medio: ${libraryInfo.averageYear}

REGOLE IMPORTANTI:
1. Crea domande DIVERSE e CREATIVE (non le solite domande sui generi)
2. Varia i tipi di domande: alcune a scelta singola, altre a scelta multipla
3. Includi domande su: atmosfere, emozioni, situazioni di lettura, personaggi, temi, stili narrativi
4. Se la biblioteca ha molti libri, includi 1-2 domande che fanno riferimento agli autori/tag della biblioteca
5. Mantieni un tono amichevole e coinvolgente

FORMATO RICHIESTO (JSON valido):
{
    "questions": [
        {
            "id": 1,
            "question": "Testo della domanda",
            "type": "single", // o "multiple"
            "options": ["Opzione 1", "Opzione 2", "Opzione 3", "Opzione 4", "Opzione 5"]
        }
    ]
}

Genera domande interessanti e originali!`;

            const response = await fetch(GEMINI_API_URL + `?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.8,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Errore API Gemini: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Risposta API non valida');
            }

            const generatedText = data.candidates[0].content.parts[0].text;
            console.log("🤖 Risposta IA ricevuta:", generatedText);

            // Parsing della risposta JSON
            const cleanText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const quizData = JSON.parse(cleanText);

            if (!quizData.questions || !Array.isArray(quizData.questions)) {
                throw new Error('Formato risposta non valido');
            }

            quizQuestions = quizData.questions.map((q, index) => ({
                id: index + 1,
                question: q.question,
                type: q.type || 'single',
                options: Array.isArray(q.options) ? q.options : []
            }));

            // Validazione delle domande generate
            quizQuestions = quizQuestions.filter(q => 
                q.question && q.options && q.options.length >= 3
            );

            if (quizQuestions.length < 4) {
                throw new Error('Troppe poche domande valide generate');
            }

            console.log(`✅ ${quizQuestions.length} domande quiz generate con successo dall'IA`);

        } catch (error) {
            console.error('❌ Errore nella generazione domande IA:', error);
            
            // Fallback con domande di base se l'IA fallisce
            console.log("🔄 Utilizzo domande di fallback...");
            quizQuestions = [
                {
                    id: 1,
                    question: "In quale momento della giornata preferisci leggere?",
                    type: "single",
                    options: [
                        "Al mattino con il caffè",
                        "Durante la pausa pranzo", 
                        "Nel pomeriggio rilassante",
                        "La sera prima di dormire",
                        "Di notte quando è tutto silenzioso",
                        "Nel weekend senza fretta"
                    ]
                },
                {
                    id: 2,
                    question: "Cosa ti spinge di più a scegliere un libro?",
                    type: "single",
                    options: [
                        "La copertina accattivante",
                        "Le recensioni positive",
                        "Il nome dell'autore",
                        "La trama descritta",
                        "Un consiglio di amici",
                        "L'istinto del momento"
                    ]
                },
                {
                    id: 3,
                    question: "Quale emozione vorresti provare leggendo?",
                    type: "single",
                    options: [
                        "Suspense e tensione",
                        "Gioia e divertimento",
                        "Nostalgia e malinconia",
                        "Curiosità e scoperta",
                        "Tranquillità e pace",
                        "Eccitazione e avventura"
                    ]
                },
                {
                    id: 4,
                    question: "Preferisci storie ambientate in:",
                    type: "single",
                    options: [
                        "Mondo contemporaneo reale",
                        "Passato storico affascinante",
                        "Futuro fantascientifico",
                        "Mondi fantasy immaginari",
                        "Luoghi esotici e lontani",
                        "Ambientazione non importante"
                    ]
                },
                {
                    id: 5,
                    question: "Cosa apprezzi di più in una narrazione?",
                    type: "single",
                    options: [
                        "Dialoghi brillanti e realistici",
                        "Descrizioni dettagliate e poetiche",
                        "Azione incalzante e ritmo veloce",
                        "Sviluppo psicologico dei personaggi",
                        "Colpi di scena inaspettati",
                        "Atmosfere evocative e suggestive"
                    ]
                }
            ];
        }
        
        console.log("❓ Domande quiz finali:", quizQuestions.length);
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

    // ===== AUTOCOMPLETAMENTO PER TEST IA AVANZATO =====

    // Setup autocompletamento per il campo test (ora dentro initApp per accedere alle funzioni)
    function setupTestBookTitleAutocomplete() {
        const testInput = document.getElementById('testBookTitle');
        const testSuggestions = document.getElementById('testBookTitleSuggestions');
        
        if (!testInput || !testSuggestions) {
            console.warn('⚠️ Elementi autocompletamento test non trovati, riprovo tra 2 secondi...');
            setTimeout(setupTestBookTitleAutocomplete, 2000);
            return;
        }
        
        console.log('✅ Setup autocompletamento test iniziato');
        
        testInput.addEventListener('input', function() {
            const value = this.value.toLowerCase().trim();
            testSuggestions.innerHTML = '';
            
            if (value.length < 2) {
                testSuggestions.style.display = 'none';
                return;
            }
            
            // Filtra e ordina libri simili usando lo stesso algoritmo della ricerca principale
            const matchingBooks = allBooks
                .filter(book => {
                    if (!book.title) return false;
                    const similarity = calculateSimilarity(value, book.title.toLowerCase());
                    return similarity > 0.3 || book.title.toLowerCase().includes(value);
                })
                .sort((a, b) => {
                    const simA = calculateSimilarity(value, a.title.toLowerCase());
                    const simB = calculateSimilarity(value, b.title.toLowerCase());
                    return simB - simA;
                })
                .slice(0, 8);
            
            if (matchingBooks.length === 0) {
                testSuggestions.style.display = 'none';
                return;
            }
            
            console.log(`🔍 Trovati ${matchingBooks.length} libri per "${value}"`);
            
            // Genera HTML per i suggerimenti con lo stesso stile della ricerca principale
            matchingBooks.forEach(book => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.style.cssText = `
                    padding: 0.75rem 1rem;
                    cursor: pointer;
                    border-bottom: 1px solid #e5e7eb;
                    background: white;
                    transition: background-color 0.2s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;
                div.innerHTML = `
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(book.title)}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">di ${escapeHtml(book.author || 'Autore sconosciuto')}</div>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        ${book.year || ''}
                    </div>
                `;
                div.onclick = () => selectTestBookSuggestion(book.title, book.id);
                div.onmouseover = () => div.style.backgroundColor = '#f8fafc';
                div.onmouseout = () => div.style.backgroundColor = 'white';
                testSuggestions.appendChild(div);
            });
            
            testSuggestions.style.display = 'block';
            
            // Posiziona i suggerimenti
            testSuggestions.style.cssText += `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                z-index: 1000;
                max-height: 300px;
                overflow-y: auto;
                display: block;
            `;
        });
        
        // Chiudi suggerimenti quando si clicca fuori (identico alla ricerca principale)
        document.addEventListener('click', function(event) {
            if (!testInput.contains(event.target) && !testSuggestions.contains(event.target)) {
                testSuggestions.style.display = 'none';
            }
        });
    }

    // Funzione per selezionare un suggerimento del test
    window.selectTestBookSuggestion = (title, bookId) => {
        const testInput = document.getElementById('testBookTitle');
        const testSuggestions = document.getElementById('testBookTitleSuggestions');
        
        if (testInput) {
            testInput.value = title;
            testInput.dataset.selectedBookId = bookId;
            console.log(`✅ Selezionato libro: "${title}" (ID: ${bookId})`);
        }
        
        if (testSuggestions) {
            testSuggestions.style.display = 'none';
        }
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

    // ===== FUNZIONI SEZIONE RACCOMANDAZIONI AVANZATE =====

    // ---- Aggiornamento statistiche sistema ----
    window.updateRecommendationStats = () => {
        const stats = bookRecommendationSystem.getStats();
        
        // Assicurati che l'autocompletamento sia inizializzato quando si accede alla sezione
        setTimeout(setupTestBookTitleAutocomplete, 500);
        
        // Aggiorna elementi DOM se presenti
        const feedbackCountEl = document.getElementById('feedbackCount');
        const viewCountEl = document.getElementById('viewCount');
        const totalViewsEl = document.getElementById('totalViews');
        const cacheStatusEl = document.getElementById('cacheStatus');
        
        if (feedbackCountEl) feedbackCountEl.textContent = stats.feedbackEntries;
        if (viewCountEl) viewCountEl.textContent = stats.viewHistory;
        if (totalViewsEl) totalViewsEl.textContent = stats.totalViews;
        if (cacheStatusEl) {
            cacheStatusEl.textContent = stats.cacheSize > 0 ? 'Attiva' : 'Off';
            cacheStatusEl.style.color = stats.cacheSize > 0 ? 'var(--success-color)' : 'var(--text-muted)';
        }
    };

    // ---- Test sistema con libro specifico ----
    window.testRecommendationSystem = async () => {
        if (allBooks.length === 0) {
            alert('📚 Aggiungi prima alcuni libri alla tua biblioteca per testare il sistema!');
            return;
        }

        try {
            // Ottieni il titolo inserito dall'utente
            const testTitleInput = document.getElementById('testBookTitle');
            const insertedTitle = testTitleInput.value.trim();
            
            let selectedBook = null;
            
            // Se c'è un titolo inserito, cerca quel libro specifico
            if (insertedTitle) {
                // Prima controlla se c'è un ID selezionato dall'autocompletamento
                const selectedBookId = testTitleInput.dataset.selectedBookId;
                if (selectedBookId) {
                    selectedBook = allBooks.find(book => book.id === selectedBookId);
                } else {
                    // Cerca per titolo
                    selectedBook = allBooks.find(book => 
                        book.title.toLowerCase().includes(insertedTitle.toLowerCase()) ||
                        insertedTitle.toLowerCase().includes(book.title.toLowerCase())
                    );
                }
                
                if (!selectedBook) {
                    alert(`❌ Libro "${insertedTitle}" non trovato nella tua biblioteca.\n\n💡 Usa l'autocompletamento per selezionare un libro esistente o lascia vuoto per un test casuale.`);
                    return;
                }
            } else {
                // Se non c'è titolo inserito, seleziona un libro casuale
                selectedBook = allBooks[Math.floor(Math.random() * allBooks.length)];
            }
            
            const testArea = document.getElementById('testRecommendationsArea');
            const testTitleSpan = document.querySelector('#testRecommendationsArea span[id="testBookTitle"]');
            const testResultsEl = document.getElementById('testRecommendationsResults');
            
            if (!testArea || !testResultsEl) {
                console.warn('⚠️ Elementi UI test non trovati');
                return;
            }

            // Mostra area test
            testArea.style.display = 'block';
            if (testTitleSpan) {
                testTitleSpan.textContent = selectedBook.title;
            }
            
            // Scroll all'area test
            setTimeout(() => {
                testArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);

            // Genera raccomandazioni
            await bookRecommendationUI.renderRecommendations(
                'testRecommendationsResults',
                selectedBook,
                allBooks,
                {
                    showReasons: true,
                    showStats: true,
                    maxRecommendations: 6,
                    enableAnimations: true,
                    compact: false
                }
            );

            console.log(`✅ Test completato per: "${selectedBook.title}"`);

        } catch (error) {
            console.error('❌ Errore nel test sistema:', error);
            alert('❌ Errore durante il test del sistema di raccomandazione');
        }
    };

    // ---- Ottimizzazione cache ----
    window.optimizeRecommendationCache = () => {
        try {
            bookRecommendationSystem.invalidateCache();
            showExportNotification('🚀 Cache ottimizzata con successo!');
            updateRecommendationStats();
        } catch (error) {
            console.error('❌ Errore ottimizzazione cache:', error);
            showExportNotification('❌ Errore nell\'ottimizzazione cache', 'error');
        }
    };

    // ---- Analisi sentimenti feedback ----
    window.analyzeFeedbackSentiment = () => {
        const stats = bookRecommendationSystem.getStats();
        if (stats.feedbackEntries === 0) {
            alert('📊 Non ci sono ancora feedback da analizzare!');
            return;
        }

        const feedbackData = bookRecommendationSystem.exportUserData().feedback;
        let positives = 0;
        let negatives = 0;
        let total = 0;

        for (const [title, rating] of Object.entries(feedbackData)) {
            total++;
            if (rating > 0) positives++;
            else if (rating < 0) negatives++;
        }

        const positivePercentage = ((positives / total) * 100).toFixed(1);
        const negativePercentage = ((negatives / total) * 100).toFixed(1);

        alert(`📈 Analisi Sentiment Feedback:\n\n` +
              `✅ Feedback Positivi: ${positives} (${positivePercentage}%)\n` +
              `❌ Feedback Negativi: ${negatives} (${negativePercentage}%)\n` +
              `📊 Neutrali: ${total - positives - negatives} (${(100 - positivePercentage - negativePercentage).toFixed(1)}%)`);
    };
};

// Funzione per mostrare i dettagli del libro
function showBookDetail(book) {
    if (!book) {
        alert('❌ Errore: impossibile caricare i dettagli del libro');
        return;
    }
    
    // Crea modale o sezione dettagli
    const detailModal = document.createElement('div');
    detailModal.id = 'bookDetailModal';
    detailModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    const detailContent = `
        <div class="book-detail-content" style="
            background: white;
            border-radius: 20px;
            padding: 2rem;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            margin: 1rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            position: relative;
            animation: slideInScale 0.4s ease-out;
        ">
            <button onclick="closeBookDetail()" style="
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: var(--text-muted);
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            ">✕</button>
            
            <div class="book-detail-header" style="margin-bottom: 1.5rem; padding-right: 2rem;">
                <h2 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1.5rem;">
                    📖 ${escapeHtml(book.title)}
                </h2>
                ${book.author ? `
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--text-secondary); font-size: 1.2rem; font-weight: 500;">
                        ✍️ ${escapeHtml(book.author)}
                    </h3>
                ` : ''}
                ${book.year ? `
                    <p style="margin: 0 0 1rem 0; color: var(--text-muted);">
                        📅 Anno: ${book.year}
                    </p>
                ` : ''}
            </div>
            
            <div class="book-detail-body">
                ${book.description ? `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="color: var(--text-primary); margin: 0 0 0.5rem 0;">📝 Descrizione</h4>
                        <p style="color: var(--text-secondary); line-height: 1.6; margin: 0;">
                            ${escapeHtml(book.description)}
                        </p>
                    </div>
                ` : ''}
                
                ${book.tags && book.tags.length > 0 ? `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="color: var(--text-primary); margin: 0 0 0.5rem 0;">🏷️ Tag</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            ${book.tags.map(tag => `
                                <span style="
                                    background: var(--primary-gradient);
                                    color: white;
                                    padding: 0.25rem 0.75rem;
                                    border-radius: 15px;
                                    font-size: 0.85rem;
                                    font-weight: 500;
                                ">${escapeHtml(tag)}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${book.pages ? `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="color: var(--text-primary); margin: 0 0 0.5rem 0;">📄 Informazioni</h4>
                        <p style="color: var(--text-secondary); margin: 0;">
                            Pagine: ${book.pages}
                        </p>
                        ${book.publisher ? `<p style="color: var(--text-secondary); margin: 0.25rem 0 0 0;">Editore: ${escapeHtml(book.publisher)}</p>` : ''}
                        ${book.isbn ? `<p style="color: var(--text-secondary); margin: 0.25rem 0 0 0;">ISBN: ${escapeHtml(book.isbn)}</p>` : ''}
                    </div>
                ` : ''}
                
                ${book.rating ? `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="color: var(--text-primary); margin: 0 0 0.5rem 0;">⭐ Valutazione</h4>
                        <p style="color: var(--text-secondary); margin: 0;">
                            ${book.rating}/5 stelle
                        </p>
                        ${book.comment ? `<p style="color: var(--text-secondary); margin: 0.5rem 0 0 0; font-style: italic;">"${escapeHtml(book.comment)}"</p>` : ''}
                    </div>
                ` : ''}
            </div>
            
            <div class="book-detail-actions" style="display: flex; gap: 1rem; margin-top: 2rem; flex-wrap: wrap;">
                <button onclick="getRecommendationsForBook('${book.id}', '${escapeHtml(book.title)}')" style="
                    flex: 1;
                    padding: 0.75rem 1rem;
                    background: var(--primary-gradient);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    🎯 Trova Libri Simili
                </button>
                ${!allBooks.find(b => b.id === book.id) ? `
                    <button onclick="addToWishlistFromDetail('${escapeHtml(book.title)}', '${escapeHtml(book.author || '')}', '${escapeHtml(book.description || '')}', '${book.year || ''}')" style="
                        flex: 1;
                        padding: 0.75rem 1rem;
                        background: var(--success-gradient, linear-gradient(135deg, #10b981 0%, #059669 100%));
                        color: white;
                        border: none;
                        border-radius: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">
                        💝 Aggiungi alla Wishlist
                    </button>
                ` : ''}
            </div>
        </div>
        
        <style>
            @keyframes slideInScale {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(50px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
        </style>
    `;
    
    detailModal.innerHTML = detailContent;
    document.body.appendChild(detailModal);
    
    // Animazione di entrata
    setTimeout(() => {
        detailModal.style.opacity = '1';
    }, 10);
    
    // Chiudi cliccando fuori
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            closeBookDetail();
        }
    });
}

// Funzione per chiudere i dettagli del libro
window.closeBookDetail = () => {
    const modal = document.getElementById('bookDetailModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 300);
    }
};

// Funzione per ottenere raccomandazioni da modale dettagli
window.getRecommendationsForBook = async (bookId, bookTitle) => {
    closeBookDetail();
    
    // Trova il libro
    const book = allBooks.find(b => b.id === bookId);
    if (!book) {
        alert('❌ Libro non trovato per generare raccomandazioni');
        return;
    }
    
    // Vai alla sezione raccomandazioni e genera
    showSection('recommendations');
    
    setTimeout(async () => {
        try {
            await bookRecommendationUI.renderRecommendations(
                'recommendations-container',
                book,
                allBooks,
                {
                    showReasons: true,
                    showStats: true,
                    maxRecommendations: 8,
                    enableAnimations: true
                }
            );
            
            // Scorri alla sezione
            document.getElementById('recommendationsSection').scrollIntoView({ 
                behavior: 'smooth' 
            });
            
        } catch (error) {
            console.error('❌ Errore generazione raccomandazioni:', error);
            alert('❌ Errore nella generazione delle raccomandazioni');
        }
    }, 500);
};

// Funzione per aggiungere alla wishlist da modale dettagli
window.addToWishlistFromDetail = async (title, author, description, year) => {
    try {
        // Controlla duplicati
        const isDuplicate = allWishlistItems.some(item => 
            item.title.toLowerCase().trim() === title.toLowerCase().trim() && 
            item.author.toLowerCase().trim() === author.toLowerCase().trim()
        );
        
        if (isDuplicate) {
            alert('📚 Questo libro è già nella tua wishlist!');
            return;
        }
        
        const wishlistData = {
            title: title,
            author: author,
            description: description,
            year: year,
            priority: 2,
            tags: [],
            notes: `Aggiunto da raccomandazioni - ${new Date().toLocaleDateString()}`,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        if (user) {
            const wishlistRef = doc(db, 'users', user.uid, 'wishlist', Date.now().toString());
            await setDoc(wishlistRef, wishlistData);
        }
        
        alert('✅ Libro aggiunto alla wishlist!');
        closeBookDetail();
        
    } catch (error) {
        console.error('❌ Errore aggiunta wishlist:', error);
        alert('❌ Errore nell\'aggiungere il libro alla wishlist');
    }
};

// ===== FUNZIONI GLOBALI (fuori da initApp) =====

// ---- Aggiorna datalist per form inserimento ----
function updateFormDataLists() {
    console.log("🔍 Aggiornamento datalist form - Titoli:", allTitles.size, "Autori:", allAuthors.size);
    
    // Aggiorna datalist titoli
    const titleOptions = document.getElementById('titleOptions');
    if (titleOptions) {
        titleOptions.innerHTML = '';
        const titlesArray = Array.from(allTitles).sort();
        console.log("📖 Titoli da aggiungere al datalist:", titlesArray);
        titlesArray.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            titleOptions.appendChild(option);
        });
        console.log("✅ Datalist titoli aggiornato con", titlesArray.length, "opzioni");
    } else {
        console.warn("⚠️ Elemento titleOptions non trovato");
    }

    // Aggiorna datalist autori
    const authorOptions = document.getElementById('authorOptions');
    if (authorOptions) {
        authorOptions.innerHTML = '';
        const authorsArray = Array.from(allAuthors).sort();
        console.log("✍️ Autori da aggiungere al datalist:", authorsArray);
        authorsArray.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            authorOptions.appendChild(option);
        });
        console.log("✅ Datalist autori aggiornato con", authorsArray.length, "opzioni");
    } else {
        console.warn("⚠️ Elemento authorOptions non trovato");
    }
}

// ---- Funzione di test per datalist (per debug) ----
window.testDataLists = () => {
    console.log("🧪 Test manuale dei datalist");
    console.log("Titoli attuali:", Array.from(allTitles));
    console.log("Autori attuali:", Array.from(allAuthors));
    
    // Verifica che gli elementi esistano
    const titleOptions = document.getElementById('titleOptions');
    const authorOptions = document.getElementById('authorOptions');
    const titleInput = document.getElementById('bookTitle');
    const authorInput = document.getElementById('bookAuthor');
    
    console.log("Elemento titleOptions:", titleOptions);
    console.log("Elemento authorOptions:", authorOptions);
    console.log("Elemento bookTitle input:", titleInput);
    console.log("Elemento bookAuthor input:", authorInput);
    
    if (titleOptions) {
        console.log("Opzioni nel datalist titoli:", titleOptions.children.length);
        // Aggiorna i datalist manualmente
        titleOptions.innerHTML = '';
        const titlesArray = Array.from(allTitles).sort();
        console.log("📖 Titoli da aggiungere al datalist:", titlesArray);
        titlesArray.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            titleOptions.appendChild(option);
        });
        console.log("✅ Datalist titoli aggiornato con", titlesArray.length, "opzioni");
    }
    
    if (authorOptions) {
        console.log("Opzioni nel datalist autori:", authorOptions.children.length);
        // Aggiorna i datalist manualmente
        authorOptions.innerHTML = '';
        const authorsArray = Array.from(allAuthors).sort();
        console.log("✍️ Autori da aggiungere al datalist:", authorsArray);
        authorsArray.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            authorOptions.appendChild(option);
        });
        console.log("✅ Datalist autori aggiornato con", authorsArray.length, "opzioni");
    }
};

// ===== FUNZIONI GESTIONE PREFERENZE =====

// Inizializza la sezione preferenze
window.initPreferencesSection = async () => {
    console.log('🔧 Inizializzazione sezione preferenze...');
    
    if (!bookRecommendationSystem) {
        console.warn('⚠️ Sistema di raccomandazioni non disponibile');
        return;
    }
    
    // Forza il caricamento delle preferenze da Firebase
    try {
        await bookRecommendationSystem.loadUserDataFromFirebase();
        console.log('✅ Preferenze caricate da Firebase durante inizializzazione sezione');
    } catch (error) {
        console.warn('⚠️ Impossibile caricare preferenze da Firebase:', error);
    }
    
    // Aggiorna statistiche utente
    updateUserStats();
    
    // Mostra ID utente
    const userIdDisplay = document.getElementById('userIdDisplay');
    if (userIdDisplay && bookRecommendationSystem) {
        userIdDisplay.innerHTML = `ID Utente: ${bookRecommendationSystem.userId}`;
    }
    
    // Carica impostazioni correnti
    loadCurrentPreferences();
    
    console.log('✅ Sezione preferenze inizializzata');
};

// Aggiorna le statistiche utente
window.updateUserStats = () => {
    const userStatsGrid = document.getElementById('userStatsGrid');
    if (!userStatsGrid || !bookRecommendationSystem) return;
    
    const stats = bookRecommendationSystem.getStats();
    
    userStatsGrid.innerHTML = `
        <div class="stat-card" style="background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📚</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">${allBooks.length}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">Libri nella libreria</div>
        </div>
        <div class="stat-card" style="background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">💝</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--secondary-color);">${allWishlistItems.length}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">Libri in wishlist</div>
        </div>
        <div class="stat-card" style="background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👍</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--success-color);">${stats.feedbackEntries}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">Feedback dati</div>
        </div>
        <div class="stat-card" style="background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👁️</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent-color);">${stats.totalViews}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">Visualizzazioni totali</div>
        </div>
        <div class="stat-card" style="background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: var(--shadow-sm);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚙️</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--warning-color);">${stats.preferences}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">Preferenze salvate</div>
        </div>
    `;
};

// Analizza le preferenze utente
window.analyzeUserPreferences = async () => {
    if (!bookRecommendationSystem) {
        console.error('Sistema di raccomandazioni non disponibile');
        return;
    }
    
    const analysisDiv = document.getElementById('preferenceAnalysis');
    if (!analysisDiv) return;
    
    // Mostra loading
    analysisDiv.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 1rem;">🔍</div>
            <p>Analizzando le tue preferenze...</p>
        </div>
    `;
    
    try {
        const analysis = await bookRecommendationSystem.analyzeUserPreferences();
        
        // Visualizza risultati
        let html = '';
        
        if (analysis.favoriteGenres && analysis.favoriteGenres.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">🎭 Generi Preferiti</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${analysis.favoriteGenres.map(({ genre, score }) => `
                            <span style="background: var(--primary-gradient); color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.85rem; font-weight: 500;">
                                ${genre} (${score > 0 ? '+' : ''}${score})
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (analysis.preferredAuthors && analysis.preferredAuthors.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">✍️ Autori Preferiti</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${analysis.preferredAuthors.map(({ author, score }) => `
                            <span style="background: var(--secondary-gradient); color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.85rem; font-weight: 500;">
                                ${author} (${score > 0 ? '+' : ''}${score})
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (analysis.bookLengthPreference) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">📏 Lunghezza Preferita</h4>
                    <p style="color: var(--text-secondary); margin: 0;">
                        Preferisci libri di circa ${analysis.bookLengthPreference} pagine
                    </p>
                </div>
            `;
        }
        
        if (analysis.yearPreference) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">📅 Periodo Preferito</h4>
                    <p style="color: var(--text-secondary); margin: 0;">
                        Hai una preferenza per libri del ${analysis.yearPreference}
                    </p>
                </div>
            `;
        }
        
        if (analysis.readingPatterns) {
            const patterns = analysis.readingPatterns;
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">📊 Modelli di Lettura</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="text-align: center; background: rgba(102, 126, 234, 0.1); padding: 0.5rem; border-radius: 8px;">
                            <div style="font-weight: bold; color: var(--primary-color);">${Math.round(patterns.positivityRate * 100)}%</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Positività</div>
                        </div>
                        <div style="text-align: center; background: rgba(34, 197, 94, 0.1); padding: 0.5rem; border-radius: 8px;">
                            <div style="font-weight: bold; color: var(--success-color);">${patterns.positiveRatings}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Like</div>
                        </div>
                        <div style="text-align: center; background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 8px;">
                            <div style="font-weight: bold; color: var(--danger-color);">${patterns.negativeRatings}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Dislike</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (html === '') {
            html = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">📝</div>
                    <p>Non ci sono ancora abbastanza dati per analizzare le tue preferenze.</p>
                    <p>Inizia a dare feedback sui libri per ottenere analisi personalizzate!</p>
                </div>
            `;
        }
        
        analysisDiv.innerHTML = html;
        
    } catch (error) {
        console.error('Errore nell\'analisi delle preferenze:', error);
        analysisDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--danger-color);">
                <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                <p>Errore nell'analisi delle preferenze</p>
            </div>
        `;
    }
};

// Carica le impostazioni correnti
window.loadCurrentPreferences = () => {
    if (!bookRecommendationSystem) return;
    
    // Modalità raccomandazione
    const mode = bookRecommendationSystem.getUserPreference('recommendationMode', 'hybrid');
    const modeSelect = document.getElementById('recommendationMode');
    if (modeSelect) {
        modeSelect.value = mode;
    }
    
    // Numero raccomandazioni
    const count = bookRecommendationSystem.getUserPreference('recommendationCount', 8);
    const countSlider = document.getElementById('recommendationCount');
    const countDisplay = document.getElementById('recommendationCountDisplay');
    if (countSlider) {
        countSlider.value = count;
    }
    if (countDisplay) {
        countDisplay.textContent = count;
    }
};

// Imposta modalità raccomandazione
window.setRecommendationMode = async (mode) => {
    if (!bookRecommendationSystem) return;
    
    await bookRecommendationSystem.setUserPreference('recommendationMode', mode);
    console.log(`✅ Modalità raccomandazione impostata: ${mode}`);
};

// Imposta numero raccomandazioni
window.setRecommendationCount = async (count) => {
    if (!bookRecommendationSystem) return;
    
    await bookRecommendationSystem.setUserPreference('recommendationCount', parseInt(count));
    
    const countDisplay = document.getElementById('recommendationCountDisplay');
    if (countDisplay) {
        countDisplay.textContent = count;
    }
    
    console.log(`✅ Numero raccomandazioni impostato: ${count}`);
};

// Sincronizza con Firebase
window.syncWithFirebase = async () => {
    if (!bookRecommendationSystem) return;
    
    try {
        console.log('🔄 Inizio sincronizzazione bidirezionale...');
        
        // Prima carica i dati più recenti da Firebase
        await bookRecommendationSystem.loadUserDataFromFirebase();
        
        // Poi salva eventuali modifiche locali
        await bookRecommendationSystem.saveUserDataToFirebase();
        
        // Aggiorna tutte le sezioni dell'interfaccia
        updateUserStats();
        if (typeof updateRecommendationStats === 'function') {
            updateRecommendationStats();
        }
        if (typeof loadCurrentPreferences === 'function') {
            loadCurrentPreferences();
        }
        
        showNotification('✅ Sincronizzazione completata con successo!', 'success');
        console.log('🔄 Sincronizzazione bidirezionale completata');
        
    } catch (error) {
        console.error('Errore nella sincronizzazione:', error);
        showNotification('❌ Errore nella sincronizzazione', 'error');
    }
};

// Esporta preferenze utente
window.exportUserPreferences = () => {
    if (!bookRecommendationSystem) return;
    
    try {
        const userData = bookRecommendationSystem.exportUserData();
        
        const dataStr = JSON.stringify(userData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `preferenze_utente_${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showNotification('📤 Preferenze esportate con successo!', 'success');
        
    } catch (error) {
        console.error('Errore nell\'esportazione:', error);
        showNotification('❌ Errore nell\'esportazione', 'error');
    }
};

// Importa preferenze utente
window.importUserPreferences = () => {
    if (!bookRecommendationSystem) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const userData = JSON.parse(text);
            
            await bookRecommendationSystem.importUserData(userData);
            
            showNotification('📥 Preferenze importate con successo!', 'success');
            
            // Aggiorna la sezione
            updateUserStats();
            loadCurrentPreferences();
            
        } catch (error) {
            console.error('Errore nell\'importazione:', error);
            showNotification('❌ File non valido o corrotto', 'error');
        }
    };
    
    input.click();
};

// Reset completo delle preferenze
window.resetAllPreferences = async () => {
    if (!bookRecommendationSystem) return;
    
    const confirmed = confirm(
        '🚨 ATTENZIONE: Reset Completo\n\n' +
        'Questa operazione eliminerà TUTTI i tuoi dati:\n' +
        '• Feedback sui libri\n' +
        '• Cronologia visualizzazioni\n' +
        '• Preferenze personali\n' +
        '• Dati di analisi\n\n' +
        'L\'operazione NON può essere annullata!\n\n' +
        'Sei sicuro di voler procedere?'
    );
    
    if (confirmed) {
        try {
            await bookRecommendationSystem.resetUserData();
            
            showNotification('🔄 Reset completo eseguito!', 'success');
            
            // Aggiorna la sezione
            updateUserStats();
            loadCurrentPreferences();
            
            // Pulisci l'analisi
            const analysisDiv = document.getElementById('preferenceAnalysis');
            if (analysisDiv) {
                analysisDiv.innerHTML = `
                    <p style="color: var(--text-muted); text-align: center; padding: 2rem;">
                        Dati resettati. Clicca "Aggiorna Analisi" dopo aver dato nuovi feedback.
                    </p>
                `;
            }
            
        } catch (error) {
            console.error('Errore nel reset:', error);
            showNotification('❌ Errore durante il reset', 'error');
        }
    }
};

// Mostra notifica
function showNotification(message, type = 'info') {
    // Crea elemento notifica
    const notification = document.createElement('div');
    notification.className = 'preference-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
                    type === 'error' ? 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)' : 
                    'linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        max-width: 300px;
        font-weight: 500;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animazione di entrata
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Rimozione automatica
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// === FUNZIONE DI DEBUG ===
window.debugPreferencesSync = () => {
    if (!bookRecommendationSystem) {
        console.log('❌ Sistema di raccomandazioni non disponibile');
        return;
    }
    
    console.log('🔍 DEBUG - Stato sincronizzazione preferenze:');
    console.log('📊 Statistiche:', bookRecommendationSystem.getStats());
    console.log('👤 ID Utente:', bookRecommendationSystem.userId);
    console.log('📝 Feedback:', Object.fromEntries(bookRecommendationSystem.userFeedback || new Map()));
    console.log('👁️ Visualizzazioni:', Object.fromEntries(bookRecommendationSystem.viewHistory || new Map()));
    console.log('⚙️ Preferenze:', Object.fromEntries(bookRecommendationSystem.userPreferences || new Map()));
    console.log('🔥 Firebase disponibile:', !!(window.firebaseDb && window.firebaseModules));
    
    // Test rapido Firebase
    if (window.firebaseDb && window.firebaseModules) {
        const { doc } = window.firebaseModules;
        const userDocRef = doc(window.firebaseDb, 'userPreferences', bookRecommendationSystem.userId);
        console.log('📍 Riferimento documento Firebase:', userDocRef);
    }
    
    showNotification('🔍 Debug info stampata in console', 'info');
};
