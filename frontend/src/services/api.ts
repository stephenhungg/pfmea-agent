/** API client for backend communication */
import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface UploadResponse {
  analysis_id: number
  filename: string
  status: string
  message: string
}

export interface Analysis {
  id: number
  filename: string
  status: string
  uploaded_at: string
  completed_at?: string
  error_message?: string
}

export interface PFMEAResult {
  id?: number
  process: string
  subprocess?: string
  failure_mode: string
  potential_effect: string
  severity: number
  severity_justification?: string
  occurrence: number
  occurrence_justification?: string
  rpn: number
  risk_level: string
  action_required: string
  control_point?: string
  confidence?: string
}

export interface AnalysisWithResults extends Analysis {
  pfmea_results: PFMEAResult[]
}

export interface AnalysisStatus {
  analysis_id: number
  status: string
  progress?: number
  message?: string
}

// Upload PDF
export const uploadPDF = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post<UploadResponse>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

// Start analysis
export const startAnalysis = async (analysisId: number, fastMode: boolean = false): Promise<AnalysisStatus> => {
  const response = await api.post<AnalysisStatus>(`/analyze/${analysisId}`, null, {
    params: { fast_mode: fastMode }
  })
  return response.data
}

// Get all analyses
export const getAnalyses = async (): Promise<Analysis[]> => {
  const response = await api.get<Analysis[]>('/analyses')
  return response.data
}

// Get analysis with results
export const getAnalysis = async (analysisId: number): Promise<AnalysisWithResults> => {
  const response = await api.get<AnalysisWithResults>(`/analyses/${analysisId}`)
  return response.data
}

// Get analysis status
export const getAnalysisStatus = async (analysisId: number): Promise<AnalysisStatus> => {
  const response = await api.get<AnalysisStatus>(`/analyses/${analysisId}/status`)
  return response.data
}

// Get analysis results
export const getAnalysisResults = async (analysisId: number): Promise<PFMEAResult[]> => {
  const response = await api.get<PFMEAResult[]>(`/analyses/${analysisId}/results`)
  return response.data
}

// Export results
export const exportResults = async (analysisId: number, format: 'csv' | 'excel'): Promise<Blob> => {
  const response = await api.get(`/export/${analysisId}`, {
    params: { format },
    responseType: 'blob',
  })
  return response.data
}

// Delete analysis
export const deleteAnalysis = async (analysisId: number): Promise<{ message: string; analysis_id: number }> => {
  const response = await api.delete(`/analyses/${analysisId}`)
  return response.data
}






