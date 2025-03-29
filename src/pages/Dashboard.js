import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const [recordings, setRecordings] = useState([]);
  const [stories, setStories] = useState([]);
  const [userStories, setUserStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddStory, setShowAddStory] = useState(false);
  const [newStory, setNewStory] = useState({
    title: '',
    description: ''
  });
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    const api = process.env.REACT_APP_API
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        
        // Lấy danh sách tất cả câu chuyện có sẵn
        const storiesResponse = await fetch(`${api}/stories/`);

        if (!storiesResponse.ok) {
          throw new Error(`Không thể kết nối với API stories: ${storiesResponse.status}`);
        }
        const storiesData = await storiesResponse.json();
        
        // Lấy danh sách bản ghi âm của người dùng
        try {
          const recordingsResponse = await fetch(`http://localhost:8000/user-recordings/${user.uid}`);
          if (recordingsResponse.ok) {
            const recordingsData = await recordingsResponse.json();
            setRecordings(recordingsData);
            
            // Tạo danh sách câu chuyện của người dùng từ bản ghi âm
            // Lọc ra các câu chuyện không trùng lặp dựa vào story_id
            const userStoriesMap = {};
            const userStoryIds = new Set(); // Lưu ID của các câu chuyện người dùng đã ghi âm
            
            recordingsData.forEach(recording => {
              userStoryIds.add(recording.story_id);
              
              if (!userStoriesMap[recording.story_id]) {
                userStoriesMap[recording.story_id] = {
                  story_id: recording.story_id,
                  title: recording.title,
                  description: "", // API recordings không trả về mô tả
                  created_at: recording.created_at
                };
              }
            });
            
            // Chuyển đổi từ object sang array
            const userStoriesData = Object.values(userStoriesMap);
            setUserStories(userStoriesData);
            
            // Lọc danh sách câu chuyện có sẵn để loại bỏ các câu chuyện người dùng đã ghi âm
            const availableStories = storiesData.filter(story => !userStoryIds.has(story.story_id));
            setStories(availableStories);
          } else {
            // Nếu không có bản ghi âm, API sẽ trả về 404, hiển thị tất cả câu chuyện có sẵn
            setRecordings([]);
            setUserStories([]);
            setStories(storiesData);
          }
        } catch (err) {
          console.error('Không thể lấy danh sách bản ghi âm:', err);
          setRecordings([]);
          setUserStories([]);
          setStories(storiesData);
        }
        
        // Trạng thái ghi âm của người dùng
        const statusResponse = await fetch(`http://localhost:8000/recording-status/${user.uid}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log("Trạng thái ghi âm:", statusData);
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate]);

  // Hàm thêm câu chuyện mới
  const handleAddStory = async (e) => {
    e.preventDefault();
    if (!newStory.title.trim()) {
      setError('Vui lòng nhập tiêu đề cho câu chuyện');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:8000/stories/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStory),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Không thể thêm câu chuyện');
      }
      
      const data = await response.json();
      
      // Thêm câu chuyện mới vào danh sách
      const newStoryWithId = {
        ...newStory,
        story_id: data.story_id,
        created_at: new Date().toISOString()
      };
      
      // Thêm vào danh sách câu chuyện có sẵn
      setStories([newStoryWithId, ...stories]);
      
      // Reset form
      setNewStory({
        title: '',
        description: ''
      });
      setShowAddStory(false);
      
      // Chuyển đến trang câu chuyện để ghi âm
      navigate(`/story/${data.story_id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Hàm xóa bản ghi âm
  const handleDeleteRecording = async (recordingId) => {
    try {
      // Lấy thông tin recording trước khi xóa
      const recordingToDelete = recordings.find(rec => rec.recording_id === recordingId);
      if (!recordingToDelete) return;
      
      const storyId = recordingToDelete.story_id;
      
      const response = await fetch(`http://localhost:8000/recordings/${recordingId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Unable to delete recording');
      }
      
      // Update recordings list
      const updatedRecordings = recordings.filter(rec => rec.recording_id !== recordingId);
      setRecordings(updatedRecordings);
      
      // Check if there are other recordings for this story
      const hasOtherRecordingsForStory = updatedRecordings.some(rec => rec.story_id === storyId);
      
      // If there are no other recordings for this story
      if (!hasOtherRecordingsForStory) {
        // Update userStories to remove the story with deleted recording
        setUserStories(prevUserStories => 
          prevUserStories.filter(story => story.story_id !== storyId)
        );
        
        // Refresh available stories list
        refreshAvailableStories();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Hàm xử lý khi người dùng nhấn nút Tải xuống
  const handleDownload = (recording) => {
    if (!recording.processed) {
      alert('This recording may not be fully processed yet. If you cannot download it, please try again later.');
    }
    window.open(`http://localhost:8000/story/${user.uid}/${recording.story_id}`, '_blank');
  };

  // Định dạng thời gian
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Thêm hàm xóa câu chuyện
  const handleDeleteStory = async (storyId) => {
    // Ask for confirmation before deleting
    if (!window.confirm('Are you sure you want to delete this story? All related recordings will also be deleted.')) {
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/stories/${storyId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Unable to delete story');
      }
      
      // Update user stories list
      setUserStories(prevUserStories => 
        prevUserStories.filter(story => story.story_id !== storyId)
      );
      
      // Update recordings list
      setRecordings(prevRecordings => 
        prevRecordings.filter(rec => rec.story_id !== storyId)
      );
      
      // Refresh available stories
      const storiesResponse = await fetch('http://localhost:8000/stories/');
      if (storiesResponse.ok) {
        const storiesData = await storiesResponse.json();
        setStories(storiesData);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Function to refresh available stories
  const refreshAvailableStories = async () => {
    try {
      const storiesResponse = await fetch('http://localhost:8000/stories/');
      if (storiesResponse.ok) {
        const storiesData = await storiesResponse.json();
        
        // Get list of user's current story_ids
        const userStoryIds = userStories.map(story => story.story_id);
        
        // Filter out stories that user has already recorded
        const availableStories = storiesData.filter(story => 
          !userStoryIds.includes(story.story_id)
        );
        
        setStories(availableStories);
      }
    } catch (err) {
      console.error('Unable to refresh stories list:', err);
    }
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

  if (error) {
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
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in py-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl text-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold mb-4">Hello, {user?.email || 'User'}</h1>
        <p className="text-blue-100 mb-6">Welcome to the audiobook application</p>
        
        {showAddStory ? (
          <div className="bg-white rounded-lg p-6 mb-4 shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add new story</h3>
            <form onSubmit={handleAddStory}>
              <div className="mb-4">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={newStory.title}
                  onChange={(e) => setNewStory({ ...newStory, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="Enter story title"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={newStory.description}
                  onChange={(e) => setNewStory({ ...newStory, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="Enter a short description of the story"
                  rows="3"
                ></textarea>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddStory(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add story
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setShowAddStory(true)}
            className="flex items-center px-4 py-2 bg-white text-blue-700 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add new story
          </button>
        )}
      </div>

      {/* User stories list */}
      {userStories.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">Your Stories</h2>
            <div className="flex space-x-2">
              <div className="flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
                <span className="h-2 w-2 bg-blue-500 rounded-full mr-1"></span>
                Recorded
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userStories.map((story) => (
                    <tr key={story.story_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {story.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {story.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatDate(story.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => navigate(`/story/${story.story_id}`)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          View / Record
                        </button>
                        <button 
                          onClick={() => handleDeleteStory(story.story_id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Available stories list */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">Available Stories</h2>
          <div className="flex space-x-2">
            <div className="flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs">
              <span className="h-2 w-2 bg-green-500 rounded-full mr-1"></span>
              Available
            </div>
          </div>
        </div>

        {stories && stories.length > 0 ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stories.map((story) => (
                    <tr key={story.story_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {story.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {story.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => navigate(`/story/${story.story_id}`)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No stories available</h3>
            <p className="text-gray-500">There are no stories available in the system</p>
          </div>
        )}
      </div>

      {/* Recordings list */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">Your Recordings</h2>
          <div className="flex space-x-2">
            <div className="flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs">
              <span className="h-2 w-2 bg-green-500 rounded-full mr-1"></span>
              Processed
            </div>
            <div className="flex items-center px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs">
              <span className="h-2 w-2 bg-yellow-500 rounded-full mr-1"></span>
              Processing
            </div>
          </div>
        </div>

        {recordings.length > 0 ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recording
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recordings.map((recording) => (
                    <tr key={recording.recording_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {recording.title || `Recording #${recording.story_id}`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatDate(recording.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${recording.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {recording.processed ? 'Processed' : 'Processing'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => navigate(`/story/${recording.story_id}`)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleDownload(recording)}
                          className={`text-green-600 hover:text-green-900 mr-4 ${!recording.processed ? 'opacity-70' : ''}`}
                        >
                          Download
                        </button>
                        <button 
                          onClick={() => handleDeleteRecording(recording.recording_id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No recordings available</h3>
            <p className="text-gray-500 mb-4">Please select a story and record your voice</p>
            <button
              onClick={() => navigate('/story/new')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create new recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 