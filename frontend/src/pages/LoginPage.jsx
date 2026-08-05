import React from 'react';
import { Navigate } from 'react-router-dom';
import AuthLanding from '../components/AuthLanding';

export default function LoginPage({ token, dbStatus, initiateGithubLogin }) {
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AuthLanding dbStatus={dbStatus} initiateGithubLogin={initiateGithubLogin} />;
}
