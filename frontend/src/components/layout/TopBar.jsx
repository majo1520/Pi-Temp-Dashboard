import { Link } from "react-router-dom";

export default function TopBar() {
  return (
    <header className="bg-blue-600 text-white py-6 shadow-md">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold">T-Monitor Dashboard</h1>
        <Link to="/login" className="underline text-white">Login</Link>
      </div>
    </header>
  );
} 