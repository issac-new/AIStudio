import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as jobsApi from '@/api/hermes/jobs'
import type { Job, CreateJobRequest, UpdateJobRequest } from '@/api/hermes/jobs'

function matchId(job: Job, id: string): boolean {
  return job.job_id === id || job.id === id
}

export const useJobsStore = defineStore('jobs', () => {
  const jobs = ref<Job[]>([])
  const loading = ref(false)

  async function fetchJobs() {
    loading.value = true
    try {
      jobs.value = await jobsApi.listJobs()
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      loading.value = false
    }
  }

  async function createJob(data: CreateJobRequest): Promise<Job> {
    const job = await jobsApi.createJob(data)
    jobs.value.unshift(job)
    return job
  }

  async function updateJob(jobId: string, data: UpdateJobRequest): Promise<Job> {
    const job = await jobsApi.updateJob(jobId, data)
    const idx = jobs.value.findIndex(j => matchId(j, jobId))
    if (idx !== -1) jobs.value[idx] = job
    return job
  }

  async function deleteJob(jobId: string) {
    await jobsApi.deleteJob(jobId)
    jobs.value = jobs.value.filter(j => !matchId(j, jobId))
  }

  async function pauseJob(jobId: string) {
    const job = await jobsApi.pauseJob(jobId)
    const idx = jobs.value.findIndex(j => matchId(j, jobId))
    if (idx !== -1) jobs.value[idx] = job
  }

  async function resumeJob(jobId: string) {
    const job = await jobsApi.resumeJob(jobId)
    const idx = jobs.value.findIndex(j => matchId(j, jobId))
    if (idx !== -1) jobs.value[idx] = job
  }

  async function runJob(jobId: string) {
    const job = await jobsApi.runJob(jobId)
    const idx = jobs.value.findIndex(j => matchId(j, jobId))
    if (idx !== -1) jobs.value[idx] = job
  }

  return {
    jobs,
    loading,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    pauseJob,
    resumeJob,
    runJob,
  }
})
