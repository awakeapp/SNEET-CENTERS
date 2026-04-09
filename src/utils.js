export const GOOGLE_MAPS_API_KEY = "AIzaSyAuZdWhpGsBr8oe1G5wUR5RW97B8IGJ6v8";

let _gmapsPromise = null;
export const loadGoogleMaps = () => {
  if (window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService) return Promise.resolve();
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    window.__gmapsResolve = () => resolve();
    const s = document.createElement('script');
    s.id  = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=__gmapsResolve&libraries=places,geometry&loading=async`;
    s.onerror = (e) => { _gmapsPromise = null; reject(e); };
    document.head.appendChild(s);
  });
  return _gmapsPromise;
};
