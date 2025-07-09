// frontend/src/components/ApprovalDashboard.js

import React, { useState, useEffect } from 'react';

const ApprovalDashboard = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');

  const fetchPendingMessages = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5001/api/messages/pending');
      if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPendingMessages(); }, []);

  const handleApprove = async (messageId) => {
    try {
      await fetch(`http://localhost:5001/api/messages/${messageId}/approve`, { method: 'PUT' });
      setMessages(currentMessages => currentMessages.filter(msg => msg.id !== messageId));
    } catch (error) { console.error("Approval error:", error); }
  };

  const handleReject = async (messageId) => {
    try {
      await fetch(`http://localhost:5001/api/messages/${messageId}/reject`, { method: 'PUT' });
      setMessages(currentMessages => currentMessages.filter(msg => msg.id !== messageId));
    } catch (error) { console.error("Rejection error:", error); }
  };

  const startEdit = (message) => {
    setEditingMessageId(message.id);
    setEditText(message.content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = async (messageId) => {
    try {
      await fetch(`http://localhost:5001/api/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newContent: editText }),
      });
      setMessages(currentMessages =>
        currentMessages.map(msg => 
          msg.id === messageId ? { ...msg, content: editText } : msg
        )
      );
      cancelEdit();
    } catch (error) {
      console.error("Save error:", error);
      alert('Failed to save changes.');
    }
  };

  if (loading) return <p>Loading messages for approval...</p>;

  const buttonStyle = {
    base: { padding: '8px 15px', border: 'none', borderRadius: '4px', marginRight: '10px', cursor: 'pointer' },
    approve: { backgroundColor: '#28a745', color: 'white' },
    edit: { backgroundColor: '#ffc107', color: 'black' },
    reject: { backgroundColor: '#dc3545', color: 'white' },
    save: { backgroundColor: '#007bff', color: 'white' },
    cancel: { backgroundColor: '#6c757d', color: 'white' },
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Pending Message Approval</h1>
      <button onClick={fetchPendingMessages} style={{ marginBottom: '20px', padding: '8px 15px', cursor: 'pointer' }}>
        Refresh List
      </button>

      {messages.length === 0 && !loading ? (
        <p>No messages are currently waiting for approval. Great job!</p>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} style={{ border: '1px solid #ccc', padding: '15px', margin: '15px 0', borderRadius: '8px', background: '#f9f9f9' }}>
            <h3>To: {msg.full_name} <span style={{color: '#555', fontWeight: 'normal'}}>({msg.title} at {msg.company})</span></h3>
            
            {/* ==================================================================== */}
            {/* --- THIS IS THE UPGRADED LINE YOU WANTED TO ADD --- */}
            {/* ==================================================================== */}
            <p><strong>Channel:</strong> <span style={{textTransform: 'capitalize', fontWeight: 'bold', color: msg.channel === 'linkedin' ? '#0077B5' : '#c71610'}}>{msg.channel}</span></p>

            <p><strong>Drafted Message:</strong></p>
            {editingMessageId === msg.id ? (
              // --- EDITING VIEW ---
              <>
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: '95%', minHeight: '120px', padding: '10px', border: '1px solid #007bff', borderRadius: '4px' }} />
                <div style={{ marginTop: '10px' }}>
                  <button onClick={() => saveEdit(msg.id)} style={{...buttonStyle.base, ...buttonStyle.save}}>Save Changes</button>
                  <button onClick={cancelEdit} style={{...buttonStyle.base, ...buttonStyle.cancel}}>Cancel</button>
                </div>
              </>
            ) : (
              // --- NORMAL VIEW ---
              <>
                <textarea readOnly value={msg.content} style={{ width: '95%', minHeight: '120px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }} />
                <div style={{ marginTop: '10px' }}>
                  <button onClick={() => handleApprove(msg.id)} style={{...buttonStyle.base, ...buttonStyle.approve}}>Approve</button>
                  <button onClick={() => startEdit(msg)} style={{...buttonStyle.base, ...buttonStyle.edit}}>Edit</button>
                  <button onClick={() => handleReject(msg.id)} style={{...buttonStyle.base, ...buttonStyle.reject}}>Reject</button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default ApprovalDashboard;