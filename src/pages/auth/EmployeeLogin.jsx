import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function EmployeeLogin() {
  const navigate = useNavigate();
  // نحوّل للـ PIN gate مباشرة
  React.useEffect(() => { navigate('/'); }, []);
  return null;
}
