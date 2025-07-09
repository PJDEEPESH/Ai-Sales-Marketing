// frontend/src/App.js

import React from 'react';
import ApprovalDashboard from './components/ApprovalDashboard';
import LeadUploader from './components/LeadUploader';
import './App.css';

function App() {
  // This state's only job is to trigger a refresh of the dashboard
  const [refreshKey, setRefreshKey] = React.useState(0);

  // This function is passed to the LeadUploader.
  // When the upload is successful, this function gets called.
  const handleUploadSuccess = () => {
    alert('Upload successful! The AI is now drafting messages. Click the "Refresh List" button on the dashboard in a few moments to see them.');
    
    // We change the key, which forces React to re-create the Dashboard component,
    // making it fetch data from scratch.
    setRefreshKey(prevKey => prevKey + 1);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Sales Engagement Platform</h1>
      </header>
      <main>
        <LeadUploader onUploadSuccess={handleUploadSuccess} />
        <ApprovalDashboard key={refreshKey} />
      </main>
    </div>
  );
}

export default App;