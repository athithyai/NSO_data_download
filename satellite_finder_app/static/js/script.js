document.addEventListener('DOMContentLoaded', function() {

    // --- Initialize Map ---
    const map = L.map('map').setView([52.3, 5.5], 7); // Centered on NL

    // Base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // --- Layer Groups ---
    let resultsLayer = L.featureGroup().addTo(map); // USE featureGroup for getBounds()
    let drawnItems = new L.FeatureGroup().addTo(map); // Layer to hold the drawn AOI shape

    // --- Global State Variables ---
    let customAOIGeoJSON = null; // Store the user-drawn geometry
    let drawControl = null;      // Store the draw control instance
    let drawControlActive = false; // Track if draw tools are active
    let highlightedItemId = null; // Track the ID of the currently highlighted list item

    // --- Get DOM Elements ---
    const searchForm = document.getElementById('search-form');
    const apiUsernameInput = document.getElementById('api-username');
    const apiPasswordInput = document.getElementById('api-password');
    const startDateInput = document.getElementById('startdate');
    const endDateInput = document.getElementById('enddate');
    const searchButton = document.getElementById('search-button');
    const resultsList = document.getElementById('results-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageArea = document.getElementById('error-message-area');
    const aoiModeRadios = document.querySelectorAll('input[name="aoi_mode"]');
    const aoiInstructions = document.getElementById('aoi-instructions');

    // --- Initialize Drawing Controls ---
    map.addLayer(drawnItems); // Add the layer for drawn items FIRST

    const drawOptions = {
        position: 'topleft',
        draw: {
            polyline: false,
            polygon: { allowIntersection: false, shapeOptions: { color: '#008f39' } }, // Green polygon
            circle: false,
            rectangle: { shapeOptions: { clickable: false, color: '#008f39' } }, // Green rectangle
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems, // Editable layer is drawnItems
            remove: true // Allow deleting shapes
        }
    };
    drawControl = new L.Control.Draw(drawOptions);
    // Draw control added/removed dynamically based on AOI mode

    // --- Drawing Event Handlers ---
    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        drawnItems.clearLayers(); // Clear previous drawings
        drawnItems.addLayer(layer); // Add new drawing
        customAOIGeoJSON = layer.toGeoJSON().geometry; // Store geometry
        console.log("AOI Drawn:", customAOIGeoJSON);
        aoiInstructions.style.display = 'block';
    });

    map.on(L.Draw.Event.EDITED, function (event) {
        event.layers.eachLayer(function (layer) {
            customAOIGeoJSON = layer.toGeoJSON().geometry; // Update stored geometry on edit
            console.log("AOI Edited:", customAOIGeoJSON);
        });
    });

     map.on(L.Draw.Event.DELETED, function (event) {
         if (drawnItems.getLayers().length === 0) {
             customAOIGeoJSON = null; // Clear stored geometry if shape deleted
             console.log("AOI Deleted");
         }
     });

    // --- Function to handle AOI mode change ---
    function handleAoiModeChange() {
        const selectedMode = document.querySelector('input[name="aoi_mode"]:checked').value;
        if (selectedMode === 'custom') {
            aoiInstructions.style.display = 'block';
            if (!drawControlActive) {
                map.addControl(drawControl);
                drawControlActive = true;
            }
        } else { // 'country' mode
            aoiInstructions.style.display = 'none';
            if (drawControlActive) {
                map.removeControl(drawControl);
                drawControlActive = false;
            }
            drawnItems.clearLayers();
            customAOIGeoJSON = null;
        }
    }

    // Add Event Listeners for AOI Mode Radios
    aoiModeRadios.forEach(radio => {
        radio.addEventListener('change', handleAoiModeChange);
    });
    // Initial Check for AOI mode on load
    handleAoiModeChange();


    // --- Event Listener for Search Form Submission ---
    searchForm.addEventListener('submit', function(event) {
        event.preventDefault();
        performSearch();
    });

    // --- Search Function ---
    async function performSearch() {
        const apiUsername = apiUsernameInput.value.trim();
        const apiPassword = apiPasswordInput.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const selectedAoiMode = document.querySelector('input[name="aoi_mode"]:checked').value;

        errorMessageArea.textContent = '';
        errorMessageArea.style.display = 'none';
        if (highlightedItemId) {
             const previousItem = document.getElementById(highlightedItemId);
             if (previousItem) previousItem.classList.remove('highlighted-result');
             highlightedItemId = null;
         }

        if (!apiUsername || !apiPassword || !startDate || !endDate) {
            showGeneralError('Please fill in all required fields (Credentials, Dates).');
            return;
        }
         if (new Date(startDate) > new Date(endDate)) {
             showGeneralError('Start date cannot be after end date.');
             return;
         }

        let requestBody = {
            username: apiUsername, password: apiPassword,
            startdate: startDate, enddate: endDate,
            sensorname: "RadarSat-2", aoi_mode: selectedAoiMode
        };

        if (selectedAoiMode === 'custom') {
            if (!customAOIGeoJSON) {
                showGeneralError("AOI Mode selected, but no Area of Interest has been drawn.");
                return;
            }
            requestBody.aoi_geojson = customAOIGeoJSON;
        }

        resultsList.innerHTML = '<li>Searching...</li>';
        resultsLayer.clearLayers();
        loadingIndicator.style.display = 'inline-block';
        searchButton.disabled = true;

        try {
            const response = await fetch('/search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                body: JSON.stringify(requestBody),
            });

            resultsList.innerHTML = '';

            const responseBodyText = await response.text();
            let data;
             try { data = JSON.parse(responseBodyText); }
             catch (parseError) {
                 if (!response.ok) throw new Error(`Server error: ${response.status} - ${responseBodyText || response.statusText}`);
                 else throw new Error("Received an invalid response format from the server.");
             }
            if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);


            if (data.features && data.features.length > 0) {
                console.log(`Found ${data.features.length} images.`);

                // Use L.geoJSON with onEachFeature to process and add layers
                const geoJsonLayerGroup = L.geoJSON(data.features, { // Pass the whole features array
                    style: function (feature) {
                        return { color: "#3388ff", weight: 2, opacity: 0.7, fillOpacity: 0.1 };
                    },
                    onEachFeature: function (feature, layer) {
                        // --- This function runs for each feature ---

                        // 1. Ensure feature has an ID, generate if missing (as suggested)
                        if (!feature.id) {
                            const randomId = `genid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                            console.warn(`Feature missing ID, generating random one: ${randomId}`, feature);
                            feature.id = randomId; // Assign the generated ID back to the feature object
                        }

                        // 2. Ensure the feature object is attached to the layer
                        // This happens automatically here, but explicit is fine: layer.feature = feature;

                        // 3. Generate List Item
                        const listItem = document.createElement('li');
                        const featureId = feature.id; // Now we're sure it exists
                        listItem.id = `result-item-${featureId}`;

                        const props = feature.properties || {};
                        let downloadLinks = 'No download links available.';
                        if (props.downloads && Array.isArray(props.downloads) && props.downloads.length > 0) {
                            downloadLinks = props.downloads.map(d => {
                                if (d && d.href) {
                                    const encodedUrl = encodeURIComponent(d.href);
                                    const proxyUrl = `/download_proxy?url=${encodedUrl}`;
                                    return `<a href="${proxyUrl}" target="_blank">${d.productname || 'Download'}</a>`;
                                } return '';
                            }).filter(link => link).join(' | ');
                            if (!downloadLinks) downloadLinks = 'No valid download links.';
                        }

                        let acquiredDate = 'N/A';
                        if (props.acquired) {
                            try { acquiredDate = new Date(props.acquired).toLocaleString(); }
                            catch (dateError) { console.error("Error parsing date:", props.acquired, dateError); }
                        }

                        listItem.innerHTML = `
                            <strong>ID:</strong> ${featureId} <br>
                            <strong>Acquired:</strong> ${acquiredDate} <br>
                            <strong>Sensor:</strong> ${props.sensorname || 'RadarSat-2'} <br>
                            <strong>Resolution:</strong> ${props.resolution ? props.resolution + 'm' : 'N/A'} <br>
                            <strong>Downloads:</strong> ${downloadLinks}
                        `;
                        resultsList.appendChild(listItem);


                        // 4. Add Popup
                        layer.bindPopup(
                             `<b>ID:</b> ${featureId}<br><b>Date:</b> ${acquiredDate}`
                        );

                        // 5. Add Click Listener for highlighting
                        layer.on('click', handleMapFeatureClick); // 'this' inside handleMapFeatureClick will refer to 'layer'
                    }
                }); // End L.geoJSON

                // Add the processed layers to the results group
                resultsLayer.addLayer(geoJsonLayerGroup);

                // Fit map to results bounds
                if (resultsLayer.getLayers().length > 0) {
                     map.fitBounds(resultsLayer.getBounds().pad(0.1));
                }

            } else {
                resultsList.innerHTML = '<li>No images found for the specified criteria.</li>';
            }

        } catch (error) {
            console.error('Search failed:', error);
            resultsList.innerHTML = '';
            showGeneralError(`Search failed: ${error.message}`);
        } finally {
             loadingIndicator.style.display = 'none';
             searchButton.disabled = false;
        }
    }

    // --- Function to handle clicks on map features ---
    // Uses 'this' to refer to the clicked layer
    function handleMapFeatureClick(event) {
        const clickedLayer = this;

        // --- DEBUGGING LINES (Can be removed once stable) ---
        // console.log("--- Click Debug ---");
        // console.log("Event Object (event):", event);
        // console.log("Handler Context ('this'):", clickedLayer);
        // console.log("Feature data from 'this':", clickedLayer.feature);
        // --- END OF DEBUGGING LINES ---

        // Use the feature data attached by onEachFeature (layer.feature)
        if (!clickedLayer.feature || !clickedLayer.feature.id) {
            console.warn("Clicked map layer ('this') is missing feature ID even after onEachFeature.");
            // Fallback attempt (less likely needed now)
             if (event.target && event.target.feature && event.target.feature.id){
                 console.log("Fallback: Using event.target.feature");
                 clickedLayer.feature = event.target.feature;
             } else {
                return; // Stop if no valid feature or ID is found
             }
        }

        const featureId = clickedLayer.feature.id; // Should now reliably exist
        const listItemId = `result-item-${featureId}`;
        const listItem = document.getElementById(listItemId);

        if (highlightedItemId) {
            const previousItem = document.getElementById(highlightedItemId);
            if (previousItem) previousItem.classList.remove('highlighted-result');
        }

        if (listItem) {
            listItem.classList.add('highlighted-result');
            listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            highlightedItemId = listItemId;
        } else {
            console.warn(`List item not found for ID: ${listItemId}`);
            highlightedItemId = null;
        }
        L.DomEvent.stopPropagation(event);
    }


    // --- Helper function to show errors ---
    function showGeneralError(message) {
        errorMessageArea.textContent = message;
        errorMessageArea.style.display = 'block';
    }


    // --- Set default dates ---
    function setDefaultDates() {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        const formatDate = (date) => date.toISOString().split('T')[0];
        endDateInput.value = formatDate(today);
        startDateInput.value = formatDate(oneMonthAgo);
    }

    setDefaultDates();

}); // End DOMContentLoaded