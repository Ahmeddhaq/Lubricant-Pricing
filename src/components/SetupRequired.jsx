import React from "react";

export default function SetupRequired() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6">⚙️</div>
        <h1 className="text-3xl font-bold mb-4">Configuration Required</h1>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6 text-left">
          <h2 className="font-bold text-yellow-900 mb-3">Setup Instructions:</h2>
          
          <ol className="list-decimal list-inside text-yellow-900 text-sm space-y-2 mb-4">
            <li>Create a Supabase project at <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a></li>
            <li>Go to Settings → API to get your credentials</li>
            <li>Create <code className="bg-yellow-100 px-2 py-1 rounded">.env.local</code> in project root</li>
          </ol>
          
          <div className="bg-white p-4 rounded border border-yellow-200 text-sm">
            <p className="font-mono text-xs mb-2">VITE_SUPABASE_URL=https://your-project.supabase.co</p>
            <p className="font-mono text-xs">VITE_SUPABASE_ANON_KEY=your_anon_key_here</p>
          </div>
        </div>

        <p className="text-gray-600 text-sm mb-6">
          After creating <code className="bg-gray-100 px-2 py-1 rounded">.env.local</code>, restart the development server
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 text-sm">
            <strong>Supabase Keys:</strong> Get from your project settings
          </p>
        </div>
      </div>
    </div>
  );
}
