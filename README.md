# NSO RadarSat-2 Data Finder ✨🛰️ [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) 

## Overview

Alright, RadarSat-2 explorer! Ever felt like finding specific RadarSat-2 coverage over the Netherlands was a bit of a treasure hunt? 🗺️ This web application aims to be your handy map and magnifying glass!

It connects directly to the **NSO Satellite Data Portal API** to help you visually discover RadarSat-2 scenes based on your criteria. You can search the entire country or draw your own Area of Interest (AOI), specify dates, and instantly see the footprints of available images plotted on an interactive map.

![screenshot](https://github.com/user-attachments/assets/d7da43fe-ccdc-4b40-9528-97fe2de527f1)

## Features

* **RadarSat-2 Focus:** Exclusively searches for RadarSat-2 imagery via the NSO API.
* **Date Filtering:** Select custom start and end dates.
* **Spatial Filtering:**
    * Search the entire Netherlands (default coverage).
    * Draw a custom Area of Interest (Rectangle or Polygon) directly on the map using Leaflet.draw tools.
* **Interactive Map:** Uses Leaflet.js to display results as footprints. Click footprints to highlight corresponding list entries.
* **Results List:** Shows metadata (ID, Acquired Date, Resolution) for found images.
* **Proxied Downloads:** Download links work seamlessly without requiring a second login prompt (credentials handled via secure session).
* **Modern UI:** Clean interface styled with custom CSS.

## About RadarSat-2 Data (via NSO)

RadarSat-2 is a Canadian C-band Synthetic Aperture Radar (SAR) satellite operated by MDA. SAR is an active sensor, meaning it sends out microwave pulses and records the signal that bounces back. This allows it to "see" through clouds and acquire images day or night.

Key characteristics available via the NSO api often include:

* **Sensor:** C-Band SAR (~5.6 cm wavelength).
* **Resolution:** The NSO portal provides access to data acquired at different resolutions over time (e.g., historical 25m data, and more recent 5m data since ~2015). This tool currently doesn't filter by resolution, showing all available results.
* **Polarization:** See the section below! Radar data comes in different polarizations, affecting what features are prominent.
* **Data Products:** Typically delivered as complex data or detected image products (this tool links to whatever downloads the API provides).

**Note:** This application currently searches for all available RadarSat-2 images matching your date/area criteria, regardless of the specific polarization offered by the NSO API for that scene. The results list may not explicitly show the polarization type.

## Tech Stack

* **Backend:** Python 3, Flask
* **API Interaction:** Requests
* **Frontend:** HTML5, CSS3, JavaScript (ES6+)
* **Mapping Library:** Leaflet.js
* **Drawing Plugin:** Leaflet.draw
* **Session Management:** Flask Sessions (for download proxy)

## Setup and Running Locally

Follow these steps to get the application running on your local machine:

1.  **Prerequisites:**
    * Python 3.7+ and Pip installed.
    * Git installed.

2.  **Clone Repository:**
    ```bash
    git clone https://github.com/athithyai/NSO_data_download.git
    cd NSO_data_download
    ```

3.  **Create & Activate Virtual Environment:**
    ```bash
    # Create (use python3 or python)
    python3 -m venv venv
    # Activate (Mac/Linux)
    source venv/bin/activate
    # Activate (Windows CMD)
    # venv\Scripts\activate.bat
    # Activate (Windows PowerShell)
    # venv\Scripts\Activate.ps1
    ```

4.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

5.  **NSO Portal Credentials:**
    * You need **your personal credentials** for the NSO api to work
    * Register here to access radar data: [https://www.spaceoffice.nl/nl/satellietdataportaal/toegang-data/registreren-radar/](https://www.spaceoffice.nl/nl/satellietdataportaal/toegang-data/registreren-radar/)
    * You will enter these credentials directly into the web application's form each time you search.

6.  **Run the Application:**
    * Run the Flask development server:
        ```bash
        flask run
        ```
        *(Alternatively: `python3 -m flask run`)*

7.  **Access the App:**
    * Open your web browser and navigate to: `http://127.0.0.1:5000`

## How to Use the Web App

https://github.com/user-attachments/assets/38331bb6-80e4-4946-8449-5145b94e0600

1.  **Enter Credentials:** Input your NSO Portal Username and Password.
2.  **Select Dates:** Choose a Start Date and End Date for your search window.
3.  **Choose Search Area:**
    * Select **"Entire Country"** to use the default Netherlands bounding box.
    * Select **"Draw Area of Interest (AOI)"**. The drawing toolbar will appear on the map (top-left). Select the rectangle or polygon tool and draw your desired area on the map. You can edit/delete the shape afterwards using the edit tools.
4.  **Click Search:** Submit your query.
5.  **View Results:** Found images will be listed on the right with details. Footprints will be drawn on the map.
6.  **Interact:** Click a footprint on the map to highlight and scroll to the corresponding item in the list.
7.  **Download:** Click a "Download" link in the list. The download should start automatically without requiring another login (uses the credentials from step 1 via the server proxy).

## Security Notes

* **SSL Verification (`verify=False`):** The current code **disables SSL certificate verification** when contacting the NSO API. This is a **significant security risk** and only intended as a temporary workaround for potential local environment issues. For any real use, **remove `verify=False`** from `app.py` and ensure your server environment can correctly validate the NSO API's certificate.
* **HTTPS for Deployment:** This application **must be deployed using HTTPS** (e.g., via a reverse proxy like Nginx with Let's Encrypt) to protect user credentials and session cookies in transit. Running over HTTP is insecure outside of local testing on `127.0.0.1`.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

* Please note that usage of Radarsat-2 (RS-2) data is subject to the [End User License Agreement](https://www.spaceoffice.nl/files/Dataportaal/rs2_single_user_license_agreement.pdf) as provided by the Netherlands Space Office (NSO). More information is available on [NSO's User Licenses page](https://www.spaceoffice.nl/nl/satellietdataportaal/toegang-data/registreren-radar/).
* [MIT license](https://choosealicense.com/licenses/mit/) for the repository.

## Acknowledgements

* [Netherlands Space Office (NSO)](https://www.spaceoffice.nl/)
