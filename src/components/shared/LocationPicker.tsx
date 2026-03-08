import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  address: string;
  onLocationChange: (lat: number, lng: number, address: string) => void;
  disabled?: boolean;
}

const MapClickHandler = ({ onClick }: { onClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15);
  }, [lat, lng, map]);
  return null;
};

const LocationPicker = ({ latitude, longitude, address, onLocationChange, disabled }: LocationPickerProps) => {
  const [searchQuery, setSearchQuery] = useState(address || "");
  const [searching, setSearching] = useState(false);
  const [lat, setLat] = useState(latitude || 6.5244);
  const [lng, setLng] = useState(longitude || 3.3792);
  const hasLocation = latitude !== null && longitude !== null;

  const handleMapClick = useCallback((clickLat: number, clickLng: number) => {
    if (disabled) return;
    setLat(clickLat);
    setLng(clickLng);
    // Reverse geocode
    reverseGeocode(clickLat, clickLng);
  }, [disabled]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await res.json();
      const addr = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setSearchQuery(addr);
      onLocationChange(lat, lng, addr);
    } catch {
      onLocationChange(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        const addr = data[0].display_name || searchQuery;
        setLat(newLat);
        setLng(newLng);
        setSearchQuery(addr);
        onLocationChange(newLat, newLng, addr);
      }
    } catch {
      // silently fail
    }
    setSearching(false);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || disabled) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setLat(newLat);
        setLng(newLng);
        reverseGeocode(newLat, newLng);
      },
      () => {}
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search address..."
            disabled={disabled}
            className="pl-9 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} disabled={disabled || searching}>
          {searching ? "..." : "Find"}
        </Button>
        <Button variant="outline" size="icon" onClick={handleUseCurrentLocation} disabled={disabled} title="Use current location">
          <Navigation size={14} />
        </Button>
      </div>

      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 260 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={hasLocation ? 15 : 6}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {!disabled && <MapClickHandler onClick={handleMapClick} />}
          {hasLocation && <Marker position={[lat, lng]} />}
          <RecenterMap lat={lat} lng={lng} />
        </MapContainer>
      </div>

      {hasLocation && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin size={12} className="text-primary" />
          <span>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
