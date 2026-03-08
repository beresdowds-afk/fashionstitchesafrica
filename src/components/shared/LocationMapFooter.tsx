import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LocationMapFooterProps {
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  label?: string;
}

const LocationMapFooter = ({ latitude, longitude, address, label }: LocationMapFooterProps) => {
  if (!latitude || !longitude) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={16} className="text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Physical Location</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          No location set yet. Update your address in Settings to display your location on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          <h4 className="text-sm font-semibold text-foreground">{label || "Physical Location"}</h4>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </span>
      </div>
      <div style={{ height: 200 }}>
        <MapContainer
          center={[latitude, longitude]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[latitude, longitude]}>
            {address && <Popup>{address}</Popup>}
          </Marker>
        </MapContainer>
      </div>
      {address && (
        <div className="p-3 border-t border-border">
          <p className="text-xs text-muted-foreground truncate">{address}</p>
        </div>
      )}
    </div>
  );
};

export default LocationMapFooter;
