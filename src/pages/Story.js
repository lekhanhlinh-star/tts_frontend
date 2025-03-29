import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Story = () => {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [storyDetails, setStoryDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [activeTab, setActiveTab] = useState('record'); // 'record' or 'upload'
  const [storyRecordings, setStoryRecordings] = useState([]); // List of recordings for the story
  const [selectedRecording, setSelectedRecording] = useState(null); // Currently selected recording
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const api = process.env.REACT_APP_API

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchStoryStatus = async () => {
      try {
        setLoading(true);
        
        // If this is the create new page
        if (storyId === 'new') {
          setStoryDetails({
            id: 'new',
            title: 'New Recording',
            description: 'Create a new recording for your content',
            content: 'This is where you can read the content of your story. You can record or upload an audio file.'
          });
          setStatus('new');
        } else {
          // Get story information from API
          const storiesResponse = await fetch(`${api}/stories/`);
          if (!storiesResponse.ok) {
            throw new Error('Unable to connect to server');
          }
          
          const stories = await storiesResponse.json();
          const story = stories.find(s => s.story_id === storyId);
          
          if (story) {
            // Check story status from API
            try {
              const response = await fetch(
                `${api}/story-status/${user.uid}/${storyId}`
              );
              const data = await response.json();
              setStatus(data.status);
            } catch (err) {
              console.error('Unable to get status:', err);
              setStatus('denial');
            }
            
            setStoryDetails({
              id: story.story_id,
              title: story.title,
              description: story.description,
              content: 'Please read the content of this story with your natural voice.'
            });

            // Check if there are any recordings and always load the latest one
            try {
              const audioResponse = await fetch(
                `${api}/story/${user.uid}/${storyId}`
              );
              if (audioResponse.ok) {
                const blob = await audioResponse.blob();
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
              }
            } catch (err) {
              console.error('Unable to get audio file:', err);
            }
            
            // Get the list of recordings for this story
            fetchStoryRecordings();
          } else {
            // If story_id is not found in API, use sample data
            setStoryDetails({
              id: storyId,
              title: `Story #${storyId}`,
              description: 'Story does not exist',
              content: 'This story does not exist in the system. Please select a different story.'
            });
            setStatus('denial');
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStoryStatus();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [user, storyId, navigate]);

  // Function to get list of recordings for this story
  const fetchStoryRecordings = async () => {
    try {
      const response = await fetch(`${api}/story-recordings/${storyId}`);
      if (response.ok) {
        const recordings = await response.json();
        setStoryRecordings(recordings);
      } else {
        // If there's an error (not 200 OK), set empty array
        setStoryRecordings([]);
      }
    } catch (err) {
      console.error('Unable to get list of recordings for this story:', err);
      setStoryRecordings([]);
    }
  };

  // Function to play audio of a recording
  const playRecordingAudio = async (recordingId) => {
    try {
      // Check if the recording has been processed
      const recording = storyRecordings.find(rec => rec.recording_id === recordingId);
      if (!recording || !recording.processed) {
        setError('This recording has not been processed, cannot play.');
        return;
      }
      
      setSelectedRecording(recordingId);
      const response = await fetch(`${api}/recording-audio/${recordingId}`);
      if (!response.ok) {
        throw new Error('Unable to load audio file');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const changeTab = (tab) => {
    // Reset audio state when switching tabs
    setAudioUrl(null);
    setUploadedFile(null);
    setActiveTab(tab);
  };

  const resetAudioState = () => {
    setAudioUrl(null);
    if (mediaRecorderRef.current && isRecording) {
      stopRecording();
    }
  };

  const startRecording = async () => {
    // Reset audio state before starting new recording
    resetAudioState();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      setRecordingTime(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        await uploadAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError('Unable to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const uploadAudio = async (audioBlob) => {
    try {
      setError('');
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('story_id', storyId);
      formData.append('voice_file', audioBlob, 'recording.wav');

      const response = await fetch(`${api}/record-voice/`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Unable to upload file');
      }

      const data = await response.json();
      console.log('Upload successful:', data);

      // Update status
      setStatus('process');
      
      // Reload audio from server
      await refreshAudio();
      
      setError('');
      // Show success message
      alert('Upload successful! You can listen to your recording or return to the dashboard.');
    } catch (err) {
      setError(err.message);
      console.error('Upload error:', err);
    }
  };

  // Function to refresh audio state from server
  const refreshAudio = async () => {
    try {
      const audioResponse = await fetch(
        `${api}/story/${user.uid}/${storyId}`
      );
      if (audioResponse.ok) {
        const blob = await audioResponse.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Unable to refresh audio file:', err);
      return false;
    }
  };

  const handleFileChange = (e) => {
    // Reset audio state before processing new file
    resetAudioState();
    
    const file = e.target.files[0];
    if (file) {
      // Check file format
      const fileType = file.type;
      if (fileType !== 'audio/wav' && fileType !== 'audio/mpeg' && fileType !== 'audio/mp3') {
        setError('Only WAV and MP3 formats are supported');
        e.target.value = '';
        return;
      }

      // Limit file size (example: 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setError('File size cannot exceed 10MB');
        e.target.value = '';
        return;
      }

      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setUploadedFile(file);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!uploadedFile) {
      setError('Please select an audio file before uploading');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('story_id', storyId);
      formData.append('voice_file', uploadedFile);

      const response = await fetch(`${api}/record-voice/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Unable to upload audio file');
      }

      // Get data from response
      const responseData = await response.json();
      console.log('Upload successful:', responseData);
      
      // Update status
      setStatus('process');
      
      // Reload audio from server
      await refreshAudio();
      
      setError('');
      // Show success message
      alert('Upload successful! You can listen to your recording or return to the dashboard.');
    } catch (err) {
      setError(err.message);
      console.error('Upload error:', err);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const playAudio = async () => {
    try {
      const response = await fetch(
        `${api}/story/${user.uid}/${storyId}`
      );
      if (!response.ok) {
        throw new Error('Unable to load audio file');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <svg className="animate-spin h-12 w-12 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-600">Loading data...</p>
      </div>
    );
  }

  if (!storyDetails) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">
              Story not found
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 fade-in py-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {storyDetails.title}
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">{storyDetails.description}</span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              status === 'finish'
                ? 'bg-green-100 text-green-800'
                : status === 'process'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {status === 'finish'
              ? 'Processed'
              : status === 'process'
              ? 'Processing'
              : 'Not recorded'}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1M19 20a2 2 0 002-2V8a2 2 0 00-2-2h-1M8 7h1m0 0h1m0 0h1m-3 3h1m0 0h1m0 0h1m-3 3h1m0 0h1m0 0h1" />
            </svg>
            Story Content
          </h2>
          <div className="bg-gray-50 rounded-lg p-4 text-gray-700 leading-relaxed max-h-80 overflow-y-auto">
            {storyDetails.content}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Audio
          </h2>
          
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 mb-4">
            <button 
              className={`py-2 px-4 font-medium text-sm ${activeTab === 'record' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => changeTab('record')}
            >
              Direct Recording
            </button>
            <button 
              className={`py-2 px-4 font-medium text-sm ${activeTab === 'upload' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => changeTab('upload')}
            >
              Upload File
            </button>
            <button 
              className={`py-2 px-4 font-medium text-sm ${activeTab === 'others' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => {
                setActiveTab('others');
                fetchStoryRecordings(); // Refresh recording list when switching tabs
              }}
            >
              Other Recordings
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="space-y-4">
            {/* Direct recording */}
            {activeTab === 'record' && (
              <>
                {isRecording && (
                  <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-blue-800 font-medium">Recording...</span>
                    </div>
                    <span className="text-blue-700 font-mono">{formatTime(recordingTime)}</span>
                  </div>
                )}
                
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full py-3 px-4 rounded-md text-white font-medium flex items-center justify-center ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } transition-colors duration-200`}
                >
                  {isRecording ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Start Recording
                    </>
                  )}
                </button>
              </>
            )}
            
            {/* File upload */}
            {activeTab === 'upload' && (
              <>
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".wav,.mp3,audio/wav,audio/mpeg"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  
                  <div className="space-y-2 py-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    
                    <div className="text-sm text-gray-600">
                      {uploadedFile ? (
                        <p className="font-medium text-blue-600">{uploadedFile.name}</p>
                      ) : (
                        <p>Drag and drop audio file or click to select</p>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-500">
                      Supported formats: WAV, MP3 (max 10MB)
                    </p>
                  </div>
                  
                  <button
                    onClick={triggerFileInput}
                    className="mt-2 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Select File
                  </button>
                </div>
                
                <button
                  onClick={handleUpload}
                  disabled={!uploadedFile}
                  className={`w-full py-3 px-4 rounded-md text-white font-medium flex items-center justify-center ${
                    uploadedFile
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  } transition-colors duration-200`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                  </svg>
                  Upload
                </button>
              </>
            )}
            
            {/* Recordings from other users */}
            {activeTab === 'others' && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="text-md font-medium text-gray-800">Available Recordings:</h3>
                
                {storyRecordings.length > 0 ? (
                  <div className="space-y-4">
                    {storyRecordings.map((recording) => (
                      <div 
                        key={recording.recording_id} 
                        className={`p-3 rounded-lg border ${selectedRecording === recording.recording_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-100'}`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{recording.user_email}</p>
                            <div className="flex items-center">
                              <p className="text-xs text-gray-500 mr-2">Recording date: {new Date(recording.created_at).toLocaleDateString('en-US')}</p>
                              <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${recording.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {recording.processed ? 'Processed' : 'Processing'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => playRecordingAudio(recording.recording_id)}
                            className={`flex items-center px-3 py-1 ${recording.processed ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'} text-white rounded-md transition-colors duration-200`}
                            disabled={!recording.processed}
                            title={recording.processed ? 'Listen' : 'Recording is being processed, cannot listen'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Listen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <p className="text-gray-600">No recordings available for this story</p>
                  </div>
                )}
              </div>
            )}

            {/* Audio Player */}
            {audioUrl && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-sm text-gray-600 font-medium">
                  {activeTab === 'others' && selectedRecording 
                    ? 'Playing recording from: ' + storyRecordings.find(rec => rec.recording_id === selectedRecording)?.user_email 
                    : 'Your recording:'}
                </p>
                <audio controls className="w-full">
                  <source src={audioUrl} type="audio/wav" />
                  Your browser does not support audio playback.
                </audio>
                
                <div className="flex space-x-2">
                  <button
                    onClick={refreshAudio}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                  
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="flex-1 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200 flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-7-7v14" />
                    </svg>
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="text-sm text-gray-600">
          <p className="mb-2">
            <span className="font-medium">Instructions:</span> You can choose to record directly or upload an existing audio file. If recording directly, please read the story content on the left with your natural voice.
          </p>
          <p>
            <span className="font-medium">Note:</span> For uploaded files, only WAV and MP3 formats are supported with a maximum size of 10MB. Ensure good audio quality for the best results.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Story; 