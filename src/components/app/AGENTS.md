# Components rules

- The map (Leaflet) is imported dynamically inside an effect in `MapPinPicker`. Why: it touches `window` and must not run during server rendering.
