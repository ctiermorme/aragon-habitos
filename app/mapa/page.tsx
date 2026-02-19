import MapaLeafletClient from "./MapaLeafletClient";

export default function MapaPage() {
  return (
    <main className="p-6 md:p-8">
      <h1 className="mb-4 text-3xl font-bold">Mapa de Aragón</h1>
      <MapaLeafletClient />
    </main>
  );
}
