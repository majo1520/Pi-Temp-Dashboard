import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

/**
 * User Management Component for the Admin Panel
 */
function UsersManagement({ t, isCompact = false }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    roles: ['user']
  });
  
  // State for editing a user
  const [editUserData, setEditUserData] = useState({
    isEditing: false,
    userId: null,
    username: '',
    email: '',
    active: true,
    roles: []
  });
  
  // Add state to track current logged-in user
  const [currentUser, setCurrentUser] = useState(null);
  
  // Get current session user on component mount
  useEffect(() => {
    const getSessionUser = async () => {
      try {
        const response = await fetch('/api/session', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.loggedIn && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch (err) {
        console.error('Failed to get session user:', err);
      }
    };
    
    getSessionUser();
  }, []);
  
  // State for confirming user deletion
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isDeleting: false,
    userId: null,
    username: ''
  });
  
  const [resetPasswordData, setResetPasswordData] = useState({
    userId: null,
    newPassword: '',
    isResetting: false
  });
  const [successMessage, setSuccessMessage] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Load users on component mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Fetch users from API
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err.message || t('failedToLoadUsers') || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle role selection
  const handleRoleChange = (e) => {
    const { checked, value } = e.target;
    setNewUser(prev => {
      if (checked) {
        return { ...prev, roles: [...prev.roles, value] };
      } else {
        return { ...prev, roles: prev.roles.filter(role => role !== value) };
      }
    });
  };

  // Create a new user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    try {
      await api.createUser(newUser);
      // Reset form and reload users
      setNewUser({
        username: '',
        password: '',
        email: '',
        roles: ['user']
      });
      setIsCreating(false);
      setSuccessMessage(t('userCreatedSuccess') || "User created successfully");
      loadUsers();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error creating user:", err);
      setError(err.message || t('failedToCreateUser') || "Failed to create user");
    }
  };

  // Start password reset process for a user
  const startPasswordReset = (userId) => {
    setResetPasswordData({
      userId,
      newPassword: '',
      isResetting: true
    });
    setSelectedUser(users.find(u => u.id === userId));
  };

  // Cancel password reset
  const cancelPasswordReset = () => {
    setResetPasswordData({
      userId: null,
      newPassword: '',
      isResetting: false
    });
    setSelectedUser(null);
  };

  // Handle password reset form input change
  const handleResetPasswordChange = (e) => {
    setResetPasswordData(prev => ({
      ...prev,
      newPassword: e.target.value
    }));
  };

  // Submit password reset
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    try {
      await api.resetUserPassword(
        resetPasswordData.userId, 
        resetPasswordData.newPassword
      );
      
      // Clear reset form
      setResetPasswordData({
        userId: null,
        newPassword: '',
        isResetting: false
      });
      
      // Show success message
      setSuccessMessage(t('passwordResetSuccess') || "Password reset successfully");
      setError(null);
      setSelectedUser(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
      
      loadUsers();
    } catch (err) {
      console.error("Error resetting password:", err);
      setError(err.message || t('failedToResetPassword') || "Failed to reset password");
    }
  };

  // Start user edit process
  const startEditUser = (user) => {
    setEditUserData({
      isEditing: true,
      userId: user.id,
      username: user.username,
      email: user.email || '',
      active: user.active !== false, // Default to true if not specified
      roles: [...user.roles]
    });
    setSelectedUser(user);
  };

  // Cancel user edit
  const cancelEditUser = () => {
    setEditUserData({
      isEditing: false,
      userId: null,
      username: '',
      email: '',
      active: true,
      roles: []
    });
    setSelectedUser(null);
  };

  // Handle form input changes for editing
  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Check if user is trying to deactivate their own account
    if (name === 'active' && !checked && currentUser && 
        currentUser.username === editUserData.username) {
      setError(t('cannotDeactivateOwnAccount') || "Cannot deactivate your own account");
      return;
    }
    
    setEditUserData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle role selection changes for editing
  const handleEditRoleChange = (e) => {
    const { checked, value } = e.target;
    
    // Check if user is trying to remove admin role from their own account
    if (value === 'admin' && !checked && currentUser && 
        currentUser.username === editUserData.username) {
      setError(t('cannotRemoveOwnAdminRole') || "Cannot remove admin role from your own account");
      return;
    }
    
    setEditUserData(prev => {
      if (checked) {
        return { ...prev, roles: [...prev.roles, value] };
      } else {
        return { ...prev, roles: prev.roles.filter(role => role !== value) };
      }
    });
  };

  // Submit user edit
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    
    // Validate changes if it's the current user
    if (currentUser && currentUser.username === editUserData.username) {
      // Check if admin role was removed
      if (currentUser.roles.includes('admin') && !editUserData.roles.includes('admin')) {
        setError(t('cannotRemoveOwnAdminRole') || "Cannot remove admin role from your own account");
        return;
      }
      
      // Check if account was deactivated
      if (editUserData.active === false) {
        setError(t('cannotDeactivateOwnAccount') || "Cannot deactivate your own account");
        return;
      }
    }
    
    try {
      const { userId, username, email, active, roles } = editUserData;
      await api.updateUser(userId, { username, email, active, roles });
      
      // Reset form and clear selection
      cancelEditUser();
      
      // Show success message
      setSuccessMessage(t('userUpdatedSuccess') || "User updated successfully");
      loadUsers();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error updating user:", err);
      setError(err.message || t('failedToUpdateUser') || "Failed to update user");
    }
  };

  // Start user delete process
  const startDeleteUser = (user) => {
    setDeleteConfirmation({
      isDeleting: true,
      userId: user.id,
      username: user.username
    });
    setSelectedUser(user);
  };

  // Cancel user deletion
  const cancelDeleteUser = () => {
    setDeleteConfirmation({
      isDeleting: false,
      userId: null,
      username: ''
    });
    setSelectedUser(null);
  };

  // Confirm and execute user deletion
  const handleDeleteUser = async () => {
    try {
      await api.deleteUser(deleteConfirmation.userId);
      
      // Reset state
      cancelDeleteUser();
      
      // Show success message
      setSuccessMessage(t('userDeletedSuccess') || "User deleted successfully");
      loadUsers();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error deleting user:", err);
      setError(err.message || t('failedToDeleteUser') || "Failed to delete user");
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) return 'N/A';
    
    // Format date with local timezone consideration
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  // Clear error message
  const clearError = () => {
    setError(null);
  };

  // Get role badge class
  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'user':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Render loading state
  if (loading && users.length === 0) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('loading')}</p>
      </div>
    );
  }

  // Render error state
  if (error && users.length === 0) {
    return (
      <div className="text-center py-4 text-red-500">
        <p>{error}</p>
        <button 
          onClick={loadUsers}
          className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${isCompact ? 'text-sm' : ''}`}>
      {/* Title */}
      {!isCompact && (
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
          {t('userManagement')}
        </h2>
      )}
      
      {/* Success message */}
      {successMessage && (
        <div className="p-2 bg-green-100 border border-green-400 text-green-700 rounded mb-4 flex justify-between items-center">
          <span>{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage(null)} 
            className="ml-2 text-green-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Error message if any */}
      {error && (
        <div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={clearError} 
            className="ml-2 text-red-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Two-column layout for large screens */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column - Users List */}
        <div className={`${resetPasswordData.isResetting || isCreating ? 'lg:w-1/2' : 'w-full'}`}>
          {/* Add User Button - only show if not creating or resetting */}
          {!isCreating && !resetPasswordData.isResetting && (
            <div className="mb-4">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center justify-center"
              >
                <span className="mr-2">+</span>
                <span>{t('addNewUser')}</span>
              </button>
            </div>
          )}
          
          {/* Users Card */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <h3 className="font-medium text-gray-700 dark:text-gray-200">
                {t('usersList')}
              </h3>
            </div>
            
            <div className="overflow-x-auto" style={{ maxHeight: isCompact ? '400px' : '500px' }}>
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('username')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('roles')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('lastLogin')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {users.map(user => (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        selectedUser?.id === user.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-800 dark:text-gray-200">{user.username}</span>
                          {user.email && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">{user.email}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(role => (
                            <span 
                              key={role} 
                              className={`px-1.5 py-0.5 rounded text-xs ${getRoleBadgeClass(role)}`}
                            >
                              {role === 'admin' ? t('adminRole') : 
                               role === 'user' ? t('userRole') : 
                               role === 'viewer' ? t('viewerRole') : role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                        {formatDate(user.last_login)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => startEditUser(user)}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800 rounded"
                            title={t('editUser')}
                          >
                            {t('edit') || 'Edit'}
                          </button>
                          <button
                            onClick={() => startPasswordReset(user.id)}
                            className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:hover:bg-yellow-800 rounded"
                            title={t('resetPassword')}
                          >
                            {t('resetPassword') || 'Reset Password'}
                          </button>
                          <button
                            onClick={() => startDeleteUser(user)}
                            className="text-xs px-2 py-1 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 rounded"
                            title={t('deleteUser')}
                            disabled={user.roles && user.roles.includes('admin')}
                          >
                            {t('delete') || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* Right column - Action panel */}
        {(resetPasswordData.isResetting || isCreating || editUserData.isEditing || deleteConfirmation.isDeleting) && (
          <div className="lg:w-1/2">
            {/* Password Reset Form */}
            {resetPasswordData.isResetting && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-700">
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                    {t('resetPasswordFor')}: {selectedUser?.username}
                  </h3>
                </div>
                
                <div className="p-4">
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        {t('newPassword')}:
                      </label>
                      <input
                        type="password"
                        value={resetPasswordData.newPassword}
                        onChange={handleResetPasswordChange}
                        required
                        minLength="8"
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                        placeholder={t('enterNewPassword')}
                      />
                    </div>
                    
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={cancelPasswordReset}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                      >
                        {t('resetPassword')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit User Form */}
            {editUserData.isEditing && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200">
                    {t('editUser') || 'Edit User'}: {editUserData.username}
                  </h3>
                </div>
                
                <div className="p-4">
                  <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('username')}:</label>
                      <input
                        type="text"
                        name="username"
                        value={editUserData.username}
                        onChange={handleEditInputChange}
                        required
                        minLength="3"
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('email')}:</label>
                      <input
                        type="email"
                        name="email"
                        value={editUserData.email}
                        onChange={handleEditInputChange}
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="active-status"
                        name="active"
                        checked={editUserData.active}
                        onChange={handleEditInputChange}
                        className="mr-2"
                      />
                      <label htmlFor="active-status" className="text-sm text-gray-700 dark:text-gray-300">
                        {t('activeAccount') || 'Active account'}
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('roles')}:</label>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="edit-role-admin"
                            value="admin"
                            checked={editUserData.roles.includes('admin')}
                            onChange={handleEditRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="edit-role-admin" className="text-sm cursor-pointer">{t('adminRole')}</label>
                        </div>
                        
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="edit-role-user"
                            value="user"
                            checked={editUserData.roles.includes('user')}
                            onChange={handleEditRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="edit-role-user" className="text-sm cursor-pointer">{t('userRole')}</label>
                        </div>
                        
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="edit-role-viewer"
                            value="viewer"
                            checked={editUserData.roles.includes('viewer')}
                            onChange={handleEditRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="edit-role-viewer" className="text-sm cursor-pointer">{t('viewerRole')}</label>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={cancelEditUser}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        {t('saveChanges') || 'Save changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            
            {/* Delete User Confirmation */}
            {deleteConfirmation.isDeleting && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700">
                  <h3 className="font-medium text-red-800 dark:text-red-200">
                    {t('deleteUserConfirmation') || 'Delete User'}: {deleteConfirmation.username}
                  </h3>
                </div>
                
                <div className="p-4">
                  <div className="mb-4 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded border border-red-100 dark:border-red-800">
                    <div className="font-medium mb-1 text-red-700 dark:text-red-400">
                      {t('warningTitle') || 'Warning!'}
                    </div>
                    <p className="text-red-600 dark:text-red-400">
                      {t('deleteUserWarning') || 'This action cannot be undone. All data associated with this user will be permanently deleted.'}
                    </p>
                  </div>
                  
                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={cancelDeleteUser}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      {t('confirmDelete') || 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Create User Form */}
            {isCreating && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700">
                  <h3 className="font-medium text-green-800 dark:text-green-200">
                    {t('addNewUser')}
                  </h3>
                </div>
                
                <div className="p-4">
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('username')}:</label>
                      <input
                        type="text"
                        name="username"
                        value={newUser.username}
                        onChange={handleInputChange}
                        required
                        minLength="3"
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('password')}:</label>
                      <input
                        type="password"
                        name="password"
                        value={newUser.password}
                        onChange={handleInputChange}
                        required
                        minLength="8"
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('email')}:</label>
                      <input
                        type="email"
                        name="email"
                        value={newUser.email}
                        onChange={handleInputChange}
                        className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('roles')}:</label>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="role-admin"
                            value="admin"
                            checked={newUser.roles.includes('admin')}
                            onChange={handleRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="role-admin" className="text-sm cursor-pointer">{t('adminRole')}</label>
                        </div>
                        
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="role-user"
                            value="user"
                            checked={newUser.roles.includes('user')}
                            onChange={handleRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="role-user" className="text-sm cursor-pointer">{t('userRole')}</label>
                        </div>
                        
                        <div className="flex items-center p-2 border rounded dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            id="role-viewer"
                            value="viewer"
                            checked={newUser.roles.includes('viewer')}
                            onChange={handleRoleChange}
                            className="mr-2"
                          />
                          <label htmlFor="role-viewer" className="text-sm cursor-pointer">{t('viewerRole')}</label>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreating(false)}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        {t('createUser')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UsersManagement; 