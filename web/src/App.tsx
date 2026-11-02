import type { ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { useTranslation } from 'react-i18next';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import InternalUsers from './pages/InternalUsers';
import InternalLayout from './layouts/InternalLayout';
import SupplierLayout from './layouts/SupplierLayout';
import Dashboard from './pages/Dashboard';
import TenderCreate from './pages/TenderCreate';
import RequestCreate from './pages/RequestCreate';
import TenderWorkspace from './pages/TenderWorkspace';
import Suppliers from './pages/Suppliers';
import Templates from './pages/Templates';
import Reports from './pages/Reports';
import Audit from './pages/Audit';
import SupplierPortal from './pages/SupplierPortal';
import SupplierTender from './pages/SupplierTender';

export default function App() {
  const { user, role, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return <div className="grid h-full place-items-center text-tx-soft">{t('common.loading')}</div>;
  }
  if (!user) return <Login />;
  // Authenticated but not a registered user (no role) → deny access.
  if (!role) return <Unauthorized />;

  if (role === 'supplier') {
    return (
      <Routes>
        <Route element={<SupplierLayout />}>
          <Route path="/portal" element={<SupplierPortal />} />
          <Route path="/portal/:id" element={<SupplierTender />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
      </Routes>
    );
  }

  // internal roles — pages that span all cases (or administer the system) are manager-only
  const managerOnly = (el: ReactElement) => (role === 'tender_manager' ? el : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route element={<InternalLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/requests/new"
          element={role === 'tender_manager' || role === 'requester' ? <RequestCreate /> : <Navigate to="/" replace />}
        />
        <Route path="/requests/:serial" element={managerOnly(<TenderCreate />)} />
        <Route path="/tenders/:id" element={<TenderWorkspace />} />
        <Route path="/templates" element={managerOnly(<Templates />)} />
        <Route path="/users" element={managerOnly(<InternalUsers />)} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/reports" element={managerOnly(<Reports />)} />
        <Route path="/audit" element={managerOnly(<Audit />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
