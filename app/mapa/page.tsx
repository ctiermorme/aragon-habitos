import MapaLeafletClient from "./MapaLeafletClient";

export default function MapaPage() {
  return (
    <main className="p-6 md:p-8">
      <h1 className="mb-4 text-3xl font-bold">Mapa de Aragón</h1>
      <p className="-mt-2 mb-4 text-sm text-gray-300">Tamaño y color por población total</p>
      <MapaLeafletClient />
    </main>
  );
}
