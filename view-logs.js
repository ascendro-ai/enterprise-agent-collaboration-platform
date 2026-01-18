// Utility script to view activity logs
// Run this in the browser console: copy and paste this entire file, or import it

function viewLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem('digital_worker_activity_logs') || '[]')
    
    if (logs.length === 0) {
      console.log('No logs found')
      return []
    }
    
    console.log(`\n📋 Found ${logs.length} log entries:\n`)
    console.log('='.repeat(80))
    
    logs.forEach((log, index) => {
      console.log(`\n[${index + 1}] ${log.type.toUpperCase()}`)
      console.log(`    Timestamp: ${new Date(log.timestamp).toLocaleString()}`)
      console.log(`    Digital Worker: ${log.digitalWorkerName}`)
      if (log.workflowId) console.log(`    Workflow ID: ${log.workflowId}`)
      if (log.stepId) console.log(`    Step ID: ${log.stepId}`)
      if (log.data && Object.keys(log.data).length > 0) {
        console.log(`    Data:`, log.data)
      }
      if (log.metadata) {
        console.log(`    Metadata:`, log.metadata)
      }
      console.log('-'.repeat(80))
    })
    
    console.log('\n📊 Summary:')
    const byType = {}
    const byWorker = {}
    logs.forEach(log => {
      byType[log.type] = (byType[log.type] || 0) + 1
      byWorker[log.digitalWorkerName] = (byWorker[log.digitalWorkerName] || 0) + 1
    })
    console.log('By Type:', byType)
    console.log('By Digital Worker:', byWorker)
    
    return logs
  } catch (error) {
    console.error('Error reading logs:', error)
    return []
  }
}

function exportLogsToConsole() {
  const logs = viewLogs()
  console.log('\n📥 Full JSON Export:')
  console.log(JSON.stringify(logs, null, 2))
  return logs
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  console.log('🔍 Activity Log Viewer')
  console.log('Run viewLogs() to see formatted logs')
  console.log('Run exportLogsToConsole() to see full JSON')
  console.log('\n')
  viewLogs()
}
