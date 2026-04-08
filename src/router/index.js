import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Dashboard', component: () => import('../views/DashboardView.vue') },
  { path: '/search', name: 'Search', component: () => import('../views/SearchView.vue') },
  { path: '/portfolio/:id', name: 'Portfolio', component: () => import('../views/PortfolioView.vue') },
  { path: '/settings', name: 'Settings', component: () => import('../views/SettingsView.vue') },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})
