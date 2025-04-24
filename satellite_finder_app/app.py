import os
import requests
from requests.auth import HTTPBasicAuth
# Import the warning specifically to disable it
from requests.packages.urllib3.exceptions import InsecureRequestWarning
# Import Flask components for sessions, streaming response
from flask import (
    Flask, request, jsonify, render_template, logging,
    session, Response, stream_with_context, abort, url_for
)
from urllib.parse import quote, unquote # For URL encoding/decoding

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

app = Flask(__name__)

app.secret_key = os.environ.get('FLASK_SECRET_KEY')
if not app.secret_key:
    print("WARNING: FLASK_SECRET_KEY environment variable not set. Using temporary key for sessions.")
    print("         Downloads may not work across restarts and this is INSECURE for production.")
    app.secret_key = os.urandom(32) # Generate temporary key if not set


# Configure logging (ensure logger exists)
if not app.debug:
    import logging
    from logging import StreamHandler
    stream_handler = StreamHandler()
    stream_handler.setLevel(logging.WARNING)
    app.logger.addHandler(stream_handler)
    app.logger.setLevel(logging.WARNING) # Set app logger level too
else:
    # Debug mode often logs INFO by default
    app.logger.setLevel(logging.INFO)


API_URL = "https://api.satellietdataportaal.nl/v1/search"

# Define the default bounding box for the Netherlands (used if no custom AOI)
NETHERLANDS_COORDS = [
    [
        [3.364868, 50.749124], [7.229919, 50.749124],
        [7.229919, 53.554663], [3.364868, 53.554663],
        [3.364868, 50.749124]
    ]
]

# --- Routes ---

@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search_satellite_data():
    """Handles search, stores credentials in session on success."""
    user_username = None
    try:
        data = request.get_json()
        if not data:
             app.logger.warning("Received empty or non-JSON request body")
             return jsonify({"error": "Invalid request body. Expected JSON."}), 400

        # Extract credentials and parameters
        user_username = data.get('username')
        user_password = data.get('password')
        start_date = data.get('startdate')
        end_date = data.get('enddate')
        aoi_mode = data.get('aoi_mode', 'country')
        aoi_geojson_geometry = data.get('aoi_geojson')

        # Validation
        if not all([user_username, user_password, start_date, end_date]):
             app.logger.warning("Missing required parameters in search request (creds or dates)")
             return jsonify({"error": "Missing required parameters: credentials, start date, or end date."}), 400

        # --- Determine Geometry for Payload ---
        search_geometry = None
        if aoi_mode == 'custom' and aoi_geojson_geometry:
             # Basic validation: Check if it looks like a GeoJSON geometry dictionary
             if isinstance(aoi_geojson_geometry, dict) and 'type' in aoi_geojson_geometry and 'coordinates' in aoi_geojson_geometry:
                 search_geometry = aoi_geojson_geometry
                 app.logger.info(f"Using custom AOI geometry provided by user: {user_username}.")
             else:
                 app.logger.warning(f"Received 'custom' AOI mode but invalid/missing 'aoi_geojson' for user {user_username}. Falling back to country.")
                 search_geometry = {"type": "Polygon", "coordinates": NETHERLANDS_COORDS}
        else:
             # Use default country coordinates
             search_geometry = {"type": "Polygon", "coordinates": NETHERLANDS_COORDS}
             app.logger.info(f"Using default 'Entire Country' AOI for user: {user_username}.")

        # --- Construct Payload for External API ---
        payload = {
            "type": "Feature",
            "geometry": search_geometry, # Use the determined geometry
            "properties": {
                "fields": { "geometry": True },
                "filters": {
                    "datefilter": { "startdate": start_date, "enddate": end_date },
                    "sensorfilter": { "sensorname": "RadarSat-2" } # Hardcoded sensor
                }
            }
        }

        app.logger.info(f"Making RadarSat-2 API request for user: {user_username}")

        # --- Make Request to NSO API ---
        response = requests.post(
            API_URL, json=payload,
            auth=HTTPBasicAuth(user_username, user_password),
            verify=False, # SECURITY RISK! Remove if possible in production.
            timeout=45
        )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # --- Store Credentials in Session *ONLY* on Successful Call ---
        # This makes them available for the download proxy route
        session['api_username'] = user_username
        session['api_password'] = user_password
        # Make session last only as long as the browser is open (by default)
        session.permanent = False
        app.logger.info(f"Stored credentials in session for user: {user_username}")

        api_data = response.json()
        app.logger.info(f"API search successful for user: {user_username}. Found {len(api_data.get('features', []))} features.")
        return jsonify(api_data)

    # --- Error Handling ---
    except requests.exceptions.Timeout:
        app.logger.warning(f"Request to satellite data API timed out for user: {user_username}")
        return jsonify({"error": "Request to satellite data API timed out."}), 504
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
             app.logger.warning(f"Unauthorized (401) accessing satellite API for user: {user_username}")
             # Clear session creds if they failed login
             session.pop('api_username', None)
             session.pop('api_password', None)
             return jsonify({"error": "Invalid credentials provided or unauthorized by satellite data portal."}), 401
        else:
            error_detail = f"Satellite API Error: {e.response.status_code}"
            try:
                error_text = e.response.text
                error_detail += f" - {error_text[:200]}"
            except Exception: pass
            app.logger.error(f"HTTPError {e.response.status_code} contacting satellite API for user {user_username}: {error_detail}")
            return jsonify({"error": f"Error communicating with satellite data portal (Status Code: {e.response.status_code})."}), e.response.status_code
    except requests.exceptions.RequestException as e:
        app.logger.error(f"RequestException contacting satellite API for user {user_username}: {e}")
        return jsonify({"error": f"Could not connect to satellite data API. Please check network or try again later."}), 503
    except Exception as e:
        # Clear session creds on unexpected errors too for safety
        session.pop('api_username', None)
        session.pop('api_password', None)
        app.logger.error(f"An unexpected error occurred processing search for user {user_username}: {e}", exc_info=True)
        return jsonify({"error": "An internal server error occurred processing your request."}), 500


# --- DOWNLOAD PROXY ROUTE ---
@app.route('/download_proxy')
def download_proxy():
    """Proxies download requests using credentials stored in the session."""
    # 1. Check if user has credentials in session
    api_username = session.get('api_username')
    api_password = session.get('api_password')

    if not api_username or not api_password:
        app.logger.warning("Download attempt without credentials in session.")
        # Provide a slightly more user-friendly error page or message if desired
        return "Authentication required. Please perform a search first to log in.", 401

    # 2. Get the target URL from query parameter
    target_url_encoded = request.args.get('url')
    if not target_url_encoded:
        app.logger.error("Download proxy called without target URL.")
        abort(400) # Bad request

    # Decode the URL
    target_url = unquote(target_url_encoded)

    # 3. Basic validation: Ensure it's likely an NSO URL
    # Adjust domains if the actual download links differ
    allowed_domains = ["https://api.satellietdataportaal.nl/", "https://satellietdataportaal.nl/"]
    if not any(target_url.startswith(domain) for domain in allowed_domains):
         app.logger.error(f"Download proxy attempt to non-allowed URL: {target_url}")
         return "Proxying downloads is only allowed for the NSO satellite data portal.", 400 # Bad request

    app.logger.info(f"Proxying download for user {api_username} to URL: {target_url}")

    try:
        # 4. Make the request to the actual download URL using stored credentials
        proxied_response = requests.get(
            target_url,
            auth=HTTPBasicAuth(api_username, api_password),
            verify=False, # Inherit verify setting - SECURITY RISK!
            stream=True,  # Process response in chunks
            timeout=90    # Longer timeout for downloads
        )
        proxied_response.raise_for_status() # Check for errors (401, 404 etc on NSO side)

        # 5. Stream the response back to the client
        def generate():
            try:
                for chunk in proxied_response.iter_content(chunk_size=8192): # Stream in 8KB chunks
                    yield chunk
            except requests.exceptions.RequestException as stream_err:
                app.logger.error(f"Error during download stream from {target_url}: {stream_err}")
            finally:
                proxied_response.close() # Ensure connection is closed

        # Create a Flask response, streaming the content
        headers = {}
        # Copy essential headers
        for h in ['Content-Type', 'Content-Disposition', 'Content-Length']:
            if h in proxied_response.headers:
                headers[h] = proxied_response.headers[h]

        # Ensure Content-Type is set reasonably if missing
        if 'Content-Type' not in headers:
            headers['Content-Type'] = 'application/octet-stream'

        # Ensure Content-Disposition suggests download if missing
        if 'Content-Disposition' not in headers:
             try:
                 filename = target_url.split('/')[-1].split('?')[0] or 'download' # Basic filename extraction
             except:
                 filename = 'download'
             headers['Content-Disposition'] = f'attachment; filename="{filename}"'


        # Use stream_with_context for proper handling within Flask request context
        return Response(stream_with_context(generate()), status=proxied_response.status_code, headers=headers)

    except requests.exceptions.Timeout:
        app.logger.error(f"Timeout occurred while proxying download for user {api_username} from {target_url}")
        return "The request to the NSO server timed out.", 504 # Gateway Timeout
    except requests.exceptions.HTTPError as e:
        app.logger.error(f"HTTP Error {e.response.status_code} while proxying download for user {api_username} from {target_url}")
        # Return the same error code NSO gave, or a generic one
        status_code = e.response.status_code if e.response.status_code in [401, 403, 404] else 502 # 502 Bad Gateway for others
        error_message = f"Error fetching file from NSO server (Status: {e.response.status_code})."
        if status_code == 401: error_message = "Authentication failed with NSO server during download."
        if status_code == 404: error_message = "File not found on NSO server."
        return error_message, status_code
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Network error while proxying download for user {api_username} from {target_url}: {e}")
        return "A network error occurred while trying to download the file.", 502 # Bad Gateway
    except Exception as e:
        app.logger.error(f"Unexpected error during download proxy for user {api_username}: {e}", exc_info=True)
        return "An internal server error occurred during the download process.", 500

# --- Run the App ---
if __name__ == '__main__':
    # Set debug=False for production
    # Host='0.0.0.0' makes it accessible on your network (use with caution & firewall)
    app.run(debug=True, port=5000)