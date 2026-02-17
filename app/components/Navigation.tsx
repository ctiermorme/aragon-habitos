import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="bg-blue-600 text-white p-4">
      <div className="max-w-6xl mx-auto flex gap-6">
        <Link href="/habitos" className="hover:underline">
          Hábitos
        </Link>
        <Link href="/historial" className="hover:underline">
          Historial
        </Link>
        <Link href="/estadisticas" className="hover:underline">
          Estadísticas
        </Link>
        <Link href="/mapa" className="hover:underline">
          Mapa
        </Link>
        <Link href="/configuracion" className="hover:underline">
          Configuración
        </Link>
      </div>
    </nav>
  );
}
