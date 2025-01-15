import React, { useState } from 'react';
    import './App.css';

    function App() {
      const [file, setFile] = useState(null);
      const [result, setResult] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setError(null);
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
          setError('Please select a file first');
          return;
        }

        setLoading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await fetch('/upload', {
            method: 'POST',
            body: formData
          });

          const responseData = await response.json();
          
          if (!response.ok || !responseData.success) {
            throw new Error(responseData.error || 'Upload failed');
          }

          setResult(responseData.data);
        } catch (err) {
          console.error('Fetch error:', err);
          setError(err.message || 'An unexpected error occurred');
        } finally {
          setLoading(false);
        }
      };

      return (
        <div className="container">
          <h1>File Upload with LLM</h1>
          <form onSubmit={handleSubmit}>
            <input 
              type="file" 
              onChange={handleFileChange} 
              accept="image/*,application/pdf" 
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Processing...' : 'Upload'}
            </button>
          </form>

          {error && (
            <div className="error">
              <h2>Error:</h2>
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="result">
              <h2>Extracted Information:</h2>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      );
    }

    export default App;
