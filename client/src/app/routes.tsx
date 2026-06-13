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
            Component: DashboardPage,
          },
          {
            path: 'requirements',
            Component: RequirementsList,
          },
          {
            path: 'requirements/trash',
            Component: RequirementsTrash,
          },
          {
            path: 'requirements/new',
            Component: CreateRequirement,
          },
          {
            path: 'requirements/:id/edit',
            Component: EditRequirement,
          },
          {
            path: 'requirements/:id',
            Component: RequirementDetail,
          },
          {
            path: 'releases',
            Component: ReleaseList,
          },
          {
            path: 'releases/new',
            Component: CreateRelease,
          },
          {
            path: 'releases/:id/edit',
            Component: EditRelease,
          },
          {
            path: 'releases/:id',
            Component: ReleaseDetail,
          },
          {
            path: 'ai',
            Component: AIAssistant,
          },
          {
            path: 'manuals',
            Component: ManualsPage,
          },
          {
            path: 'help',
            Component: HelpCenterPage,
          },
          {
            path: 'team',
            Component: TeamManagement,
          },
          {
            path: 'settings',
            Component: Settings,
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
