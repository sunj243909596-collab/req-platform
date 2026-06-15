import { createBrowserRouter, Navigate } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { RequirementsList } from './pages/requirements/RequirementsList';
import { RequirementsTrash } from './pages/requirements/RequirementsTrash';
import { RequirementDetail } from './pages/requirements/RequirementDetail';
import { CreateRequirement } from './pages/requirements/CreateRequirement';
import { EditRequirement } from './pages/requirements/EditRequirement';
import { ReleaseList } from './pages/releases/ReleaseList';
import { ReleaseDetail } from './pages/releases/ReleaseDetail';
import { CreateRelease } from './pages/releases/CreateRelease';
import { EditRelease } from './pages/releases/EditRelease';
import { AIAssistant } from './pages/ai/AIAssistant';
import { TeamManagement } from './pages/team/TeamManagement';
import { Settings } from './pages/settings/Settings';
import { ManualsPage } from './pages/manuals/ManualsPage';
import { HelpCenterPage } from './pages/help/HelpCenterPage';
import { NotFound } from './pages/NotFound';
import { RequirePermission } from './components/RequirePermission';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: LoginPage,
      },
      {
        path: 'login',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'register',
        Component: RegisterPage,
      },
      {
        path: 'forgot-password',
        Component: ForgotPasswordPage,
      },
      {
        path: 'app',
        Component: DashboardLayout,
        children: [
          {
            index: true,
            element: (
              <RequirePermission permission="page:dashboard">
                <DashboardPage />
              </RequirePermission>
            ),
          },
          {
            path: 'requirements',
            element: (
              <RequirePermission permission="page:requirements">
                <RequirementsList />
              </RequirePermission>
            ),
          },
          {
            path: 'requirements/trash',
            element: (
              <RequirePermission permission="page:trash">
                <RequirementsTrash />
              </RequirePermission>
            ),
          },
          {
            path: 'requirements/new',
            element: (
              <RequirePermission permission="page:requirements">
                <CreateRequirement />
              </RequirePermission>
            ),
          },
          {
            path: 'requirements/:id/edit',
            element: (
              <RequirePermission permission="page:requirements">
                <EditRequirement />
              </RequirePermission>
            ),
          },
          {
            path: 'requirements/:id',
            element: (
              <RequirePermission permission="page:requirements">
                <RequirementDetail />
              </RequirePermission>
            ),
          },
          {
            path: 'releases',
            element: (
              <RequirePermission permission="page:releases">
                <ReleaseList />
              </RequirePermission>
            ),
          },
          {
            path: 'releases/new',
            element: (
              <RequirePermission permission="page:releases">
                <CreateRelease />
              </RequirePermission>
            ),
          },
          {
            path: 'releases/:id/edit',
            element: (
              <RequirePermission permission="page:releases">
                <EditRelease />
              </RequirePermission>
            ),
          },
          {
            path: 'releases/:id',
            element: (
              <RequirePermission permission="page:releases">
                <ReleaseDetail />
              </RequirePermission>
            ),
          },
          {
            path: 'ai',
            element: (
              <RequirePermission permission="page:ai">
                <AIAssistant />
              </RequirePermission>
            ),
          },
          {
            path: 'manuals',
            element: (
              <RequirePermission permission="page:manuals">
                <ManualsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'help',
            element: (
              <RequirePermission permission="page:help">
                <HelpCenterPage />
              </RequirePermission>
            ),
          },
          {
            path: 'team',
            element: (
              <RequirePermission permission="page:team">
                <TeamManagement />
              </RequirePermission>
            ),
          },
          {
            path: 'settings',
            element: (
              <RequirePermission permission="page:settings">
                <Settings />
              </RequirePermission>
            ),
          },
        ],
      },
      {
        path: '*',
        Component: NotFound,
      },
    ],
  },
]);
