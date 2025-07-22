// --- Firebase Configuration and Initialization ---
// IMPORTANT: This is your specific project's connection details.
const firebaseConfig = {
  apiKey: "AIzaSyD_AnGX-RO7zfM_rCBopJmdv3BOVE4V-_o",
  authDomain: "media-app-a702b.firebaseapp.com",
  projectId: "media-app-a702b",
  storageBucket: "media-app-a702b.firebasestorage.app",
  messagingSenderId: "60484045851",
  appId: "1:60484045851:web:f1bb588c2d5edc177ffcbe",
  measurementId: "G-LPBXF7MLWF"
};

// Import Firebase functions from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Initialize Firebase app and Firestore database instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore Collection References
const eventsCollectionRef = collection(db, "pwa_events"); // New collection for PWA events
const segmentsCollectionRef = collection(db, "segments"); // Existing segments collection

// --- DOM Elements ---
const mainPage = document.getElementById("mainPage");
const detailPage = document.getElementById("detailPage");

const addEventBtn = document.getElementById("addEventBtn");
const eventModal = document.getElementById("eventModal");
const eventNameInput = document.getElementById("eventNameInput");
const eventDateInput = document.getElementById("eventDateInput");
const saveEventBtn = document.getElementById("saveEventBtn");
const cancelEventBtn = document.getElementById("cancelEventBtn");

const eventList = document.getElementById("eventList");
const eventHeader = document.getElementById("eventHeader");
const contentFormContainer = document.getElementById("contentFormContainer");

const addSegmentBtn = document.getElementById("addSegmentBtn");
const syncBtn = document.getElementById("syncBtn");
const backBtn = document.getElementById("backBtn");

// Toast container
const toastContainer = document.getElementById('toastContainer');

let currentEvent = null; // Stores the currently selected event object from Firestore

// --- Custom Toast Notifications (replaces alert) ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000); // Remove after 3 seconds
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial load of events from Firestore
    loadEvents();

    addEventBtn.onclick = () => eventModal.classList.remove("hidden");
    cancelEventBtn.onclick = () => eventModal.classList.add("hidden");

    // Save new event to Firestore
    saveEventBtn.onclick = async () => {
        const name = eventNameInput.value.trim();
        const date = eventDateInput.value;

        if (!name || !date) {
            showToast("Please fill all fields for the event.", 'error');
            return;
        }

        try {
            // Add a new event document to pwa_events collection
            const docRef = await addDoc(eventsCollectionRef, {
                name: name,
                date: date,
                timestamp: new Date() // Add a timestamp for ordering
            });
            showToast("✅ Event added successfully!", 'success');
            eventModal.classList.add("hidden");
            eventNameInput.value = "";
            eventDateInput.value = "";
            loadEvents(); // Reload events to update the list
        } catch (e) {
            console.error("Error adding event: ", e);
            showToast(`❌ Failed to add event: ${e.message}`, 'error');
        }
    };

    addSegmentBtn.onclick = () => addContentForm();

    backBtn.onclick = async () => {
        // Save segments related to currentEvent before going back
        await saveSegmentsForCurrentEvent();
        detailPage.classList.add("hidden");
        mainPage.classList.remove("hidden");
        loadEvents(); // Reload events to ensure latest data
    };

    // Sync button to push segments to the 'segments' collection with isImported: false
    syncBtn.onclick = async () => {
        // First, save any local changes to the current event's segments in Firestore
        await saveSegmentsForCurrentEvent();

        if (!currentEvent || !currentEvent.segments || currentEvent.segments.length === 0) {
            showToast("No content segments to sync for this event.", 'info');
            return;
        }

        showToast("☁️ Syncing content online...", 'info');
        try {
            for (const seg of currentEvent.segments) {
                // Add isImported: false flag for Admin Panel
                await addDoc(segmentsCollectionRef, {
                    ...seg,
                    eventId: currentEvent.id, // Link segment to its parent event
                    eventName: currentEvent.name,
                    eventDate: currentEvent.date,
                    timestamp: new Date(),
                    isImported: false // CRUCIAL: Flag for Admin Panel
                });
            }
            showToast("✅ Synced successfully!", 'success');
        } catch (e) {
            console.error("Error syncing content: ", e);
            showToast(`❌ Sync failed: ${e.message}`, 'error');
        }
    };
});

// --- Event and Segment Management Functions ---

// Load events from Firestore
async function loadEvents() {
    eventList.innerHTML = "";
    try {
        // Order events by timestamp to show newest first
        const q = query(eventsCollectionRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            eventList.innerHTML = "<li>No events found. Add a new one!</li>";
            return;
        }

        querySnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            const li = document.createElement("li");
            li.textContent = `${event.date} — ${event.name}`;
            li.onclick = () => openEventDetail(event);
            eventList.appendChild(li);
        });
    } catch (e) {
        console.error("Error loading events: ", e);
        showToast(`❌ Failed to load events: ${e.message}`, 'error');
    }
}

// Open event detail page and load its segments from Firestore
async function openEventDetail(event) {
    currentEvent = event; // Set the current event
    mainPage.classList.add("hidden");
    detailPage.classList.remove("hidden");

    eventHeader.textContent = `Event: ${event.name} on ${event.date}`;
    contentFormContainer.innerHTML = ""; // Clear existing forms

    showToast("Loading segments...", 'info');
    try {
        // Fetch segments associated with this event from Firestore
        // Note: For a large number of segments, consider pagination or a more specific query
        const q = query(segmentsCollectionRef, orderBy("timestamp", "asc"));
        const querySnapshot = await getDocs(q);

        const eventSegments = [];
        querySnapshot.forEach(doc => {
            const segment = { id: doc.id, ...doc.data() };
            // Filter segments that belong to the current event
            if (segment.eventId === currentEvent.id) {
                eventSegments.push(segment);
            }
        });

        currentEvent.segments = eventSegments; // Update currentEvent with fetched segments

        if (eventSegments.length === 0) {
            addContentForm(); // Add one empty form if no segments exist
            showToast("No segments found for this event. Add new ones!", 'info');
        } else {
            eventSegments.forEach(segment => addContentForm(segment));
            showToast("✅ Segments loaded.", 'success');
        }
    } catch (e) {
        console.error("Error loading segments: ", e);
        showToast(`❌ Failed to load segments: ${e.message}`, 'error');
    }
}

// Helper function to map old PWA types to new Admin categories for display
function mapOldPwaTypeToAdminCategory(pwaType) {
    switch (pwaType) {
        case 'Sermon': return 'Sermons LIVE';
        case 'Song': return 'Entertainment';
        case 'Announcement': return 'Announcement';
        case 'Testimony': return 'Sermons LIVE'; // Map Testimony to Sermons LIVE
        case 'Other': return 'Entertainment'; // Map Other to Entertainment
        // If the PWA already stores the new Admin categories, they will match directly
        case 'Sermons LIVE': return 'Sermons LIVE';
        case 'Entertainment': return 'Entertainment';
        case 'Bible Study': return 'Bible Study';
        case 'Events': return 'Events';
        default: return pwaType; // Return as is if no specific mapping
    }
}

// Add a new content segment form to the detail page
function addContentForm(data = {}) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("segment");

    // Determine the category to pre-select based on existing data
    const selectedCategory = data.type ? mapOldPwaTypeToAdminCategory(data.type) : '';

    wrapper.innerHTML = `
        <hr>
        <label>Content Type:</label>
        <select class="contentType">
            <option value="">Select Type</option>
            <option value="Sermons LIVE" ${selectedCategory === 'Sermons LIVE' ? 'selected' : ''}>Sermons LIVE</option>
            <option value="Entertainment" ${selectedCategory === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
            <option value="Bible Study" ${selectedCategory === 'Bible Study' ? 'selected' : ''}>Bible Study</option>
            <option value="Events" ${selectedCategory === 'Events' ? 'selected' : ''}>Events</option>
            <option value="Announcement" ${selectedCategory === 'Announcement' ? 'selected' : ''}>Announcement</option>
        </select>

        <div class="time-row">
            <div>
                <label>Start Time:</label>
                <input type="time" class="startTime" value="${data.start || ""}" />
            </div>
            <div>
                <label>End Time:</label>
                <input type="time" class="endTime" value="${data.end || ""}" />
            </div>
        </div>

        <label>Title:</label>
        <input type="text" class="title" placeholder="Enter content title" value="${data.title || ""}" />

        <label>Topic:</label>
        <input type="text" class="topic" placeholder="Enter content topic" value="${data.topic || ""}" />

        <label>By (Author/Speaker):</label>
        <input type="text" class="by" placeholder="Enter author or speaker name" value="${data.by || ""}" />

        <label>Description:</label>
        <textarea class="description" placeholder="Provide a detailed description...">${data.description || ""}</textarea>
    `;

    contentFormContainer.appendChild(wrapper);
}

// Save all segments on the current detail page to Firestore
async function saveSegmentsForCurrentEvent() {
    if (!currentEvent) {
        console.warn("No current event selected to save segments.");
        return;
    }

    const segmentsToSave = [];
    const wrappers = contentFormContainer.querySelectorAll(".segment");

    wrappers.forEach(w => {
        segmentsToSave.push({
            type: w.querySelector(".contentType").value, // Now uses the new category names
            start: w.querySelector(".startTime").value,
            end: w.querySelector(".endTime").value,
            title: w.querySelector(".title").value,
            topic: w.querySelector(".topic").value,
            by: w.querySelector(".by").value,
            description: w.querySelector(".description").value,
        });
    });

    currentEvent.segments = segmentsToSave; // Update the in-memory currentEvent object

    showToast("Saving segments...", 'info');
    try {
        // Delete old segments for this event to avoid duplicates and ensure updates
        const q = query(segmentsCollectionRef, orderBy("timestamp", "asc")); // Fetch all segments
        const querySnapshot = await getDocs(q);

        const batch = db.batch(); // Use a batch write for efficiency
        querySnapshot.forEach(docSnap => {
            if (docSnap.data().eventId === currentEvent.id) {
                batch.delete(doc(db, "segments", docSnap.id));
            }
        });

        // Add updated segments
        for (const seg of segmentsToSave) {
            // Use set with a new doc ref to add, or update if you had segment IDs
            // For simplicity, we are re-adding all segments for the event.
            // If you want to update existing segments, you'd need to store segment IDs.
            batch.set(doc(segmentsCollectionRef), {
                ...seg,
                eventId: currentEvent.id,
                eventName: currentEvent.name,
                eventDate: currentEvent.date,
                timestamp: new Date(),
                isImported: false // Default to false when saving from PWA
            });
        }
        await batch.commit();
        showToast("✅ Segments saved to Firestore.", 'success');
    } catch (e) {
        console.error("Error saving segments: ", e);
        showToast(`❌ Failed to save segments: ${e.message}`, 'error');
    }
}