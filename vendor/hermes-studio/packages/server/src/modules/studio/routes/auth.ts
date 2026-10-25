import Router from '@koa/router'
import * as ctrl from '../controllers/auth'
import { requireSuperAdmin } from '../middleware/auth'

// Public routes (no auth required)
export const authPublicRoutes = new Router()
authPublicRoutes.get('/api/auth/status', ctrl.authStatus)
authPublicRoutes.post('/api/auth/login', ctrl.login)
authPublicRoutes.post('/api/auth/app-login', ctrl.appLogin)
authPublicRoutes.post('/api/auth/mcu-login', ctrl.microcontrollerLogin)
authPublicRoutes.post('/api/auth/matrix-login', ctrl.matrixLogin) // NEW

// Protected routes (auth required)
export const authProtectedRoutes = new Router()
authProtectedRoutes.post('/api/auth/setup', ctrl.setupPassword)
authProtectedRoutes.get('/api/auth/me', ctrl.currentUser)
authProtectedRoutes.post('/api/auth/change-password', ctrl.changePassword)
authProtectedRoutes.post('/api/auth/change-username', ctrl.changeUsername)
authProtectedRoutes.get('/api/auth/avatar', ctrl.getMyAvatar)
authProtectedRoutes.put('/api/auth/avatar', ctrl.updateMyAvatar)
authProtectedRoutes.delete('/api/auth/password', ctrl.removePassword)

// Existing local user management (preserved)
authProtectedRoutes.get('/api/auth/users', requireSuperAdmin, ctrl.listManagedUsers)
authProtectedRoutes.post('/api/auth/users', requireSuperAdmin, ctrl.createManagedUser)
authProtectedRoutes.put('/api/auth/users/:id', requireSuperAdmin, ctrl.updateManagedUser)
authProtectedRoutes.delete('/api/auth/users/:id', requireSuperAdmin, ctrl.deleteManagedUser)

// NEW: Matrix user management
authProtectedRoutes.get('/api/auth/matrix-users', requireSuperAdmin, ctrl.listMatrixUsers)
authProtectedRoutes.post('/api/auth/matrix-users', requireSuperAdmin, ctrl.createMatrixUser)
authProtectedRoutes.put('/api/auth/matrix-users/:id', requireSuperAdmin, ctrl.updateMatrixUser)
authProtectedRoutes.delete('/api/auth/matrix-users/:id', requireSuperAdmin, ctrl.deleteMatrixUser)
authProtectedRoutes.post('/api/auth/matrix-users/:id/deactivate', requireSuperAdmin, ctrl.deactivateMatrixUser)
authProtectedRoutes.post('/api/auth/matrix-users/:id/reset-password', requireSuperAdmin, ctrl.resetMatrixUserPassword)

authProtectedRoutes.get('/api/auth/locked-ips', requireSuperAdmin, ctrl.listLockedIps)
authProtectedRoutes.delete('/api/auth/locked-ips', requireSuperAdmin, ctrl.unlockIpHandler)
