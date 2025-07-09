// frontend/src/components/LeadUploader.js

import React, { useState } from 'react';
import Papa from 'papaparse'; // The CSV parsing library we installed

const LeadUploader = ({ onUploadSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setError('');

    // Use Papaparse to read the CSV file in the browser
    Papa.parse(file, {
      header: true,        // Treat the first row as headers
      skipEmptyLines: true, // Ignore any blank lines in the file
      
      // The 'complete' function runs after the file is fully parsed
      complete: (results) => {
        
        // We will "clean" the data from the CSV to perfectly match our database needs.
        const cleanedLeads = results.data.map(lead => {
          // This creates a new, perfect object for each lead
          return {
            full_name: lead.full_name || '',
            company: lead.company || '',
            title: lead.title || '',
            email: lead.email || '',
            // This is smart: it checks for 'linkedinUrl' OR 'linkedin_url'
            linkedin_url: lead.linkedinUrl || lead.linkedin_url || '', 
            // This is the main fix: it reads the preferred_channel and provides a default
            preferred_channel: lead.preferred_channel || 'email' 
          };
        });
        
        // This is a safety check to remove any rows that are missing a name or email
        const validLeads = cleanedLeads.filter(lead => lead.full_name && lead.email);
        
        if (validLeads.length > 0) {
            sendLeadsToBackend(validLeads);
        } else {
            setError('No valid leads found in the file. Please check for missing full_name or email values.');
            setIsUploading(false);
        }
      },
      error: (err) => {
        setError('Failed to parse CSV file: ' + err.message);
        setIsUploading(false);
      },
    });
  };

  const sendLeadsToBackend = async (leads) => {
    try {
      // Send the clean, valid JSON array to our backend API
      const response = await fetch('http://localhost:5001/api/leads/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leads),
      });

      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Backend failed to process the leads.');
      }
      
      // If the backend confirms success, we tell App.js to refresh the dashboard
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '20px' }}>
      <h2>Upload Leads CSV</h2>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Required columns: <strong>full_name, company, title, email, linkedinUrl, preferred_channel</strong>
      </p>
      <input type="file" accept=".csv" onChange={handleFileChange} disabled={isUploading} />
      {isUploading && <p>Uploading and processing...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
};

export default LeadUploader;