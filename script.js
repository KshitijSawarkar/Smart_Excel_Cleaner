// Global variables
let originalData = [];
let cleanedData = [];
let dataAnalysis = {};
let cleaningStats = {
    missingFixed: 0,
    duplicatesRemoved: 0,
    outliersHandled: 0
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeUpload();
});

// Initialize upload functionality
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    // Click to upload
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file processing
function handleFile(file) {
    // Validate file type
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
        alert('Please upload a CSV or Excel file');
        return;
    }
    
    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        alert('File size must be less than 50MB');
        return;
    }
    
    // Show file info
    showFileInfo(file);
    
    // Show upload progress
    showUploadProgress();
    
    // Process file based on type
    if (fileExtension === '.csv') {
        processCSV(file);
    } else {
        processExcel(file);
    }
}

// Show file information
function showFileInfo(file) {
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').classList.remove('hidden');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Show upload progress
function showUploadProgress() {
    document.getElementById('uploadProgress').classList.remove('hidden');
    
    // Simulate progress
    let progress = 0;
    const progressBar = document.querySelector('.progress-bar');
    const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                document.getElementById('uploadProgress').classList.add('hidden');
            }, 500);
        }
    }, 100);
}

// Process CSV file
function processCSV(file) {
    Papa.parse(file, {
        complete: function(results) {
            if (results.data && results.data.length > 0) {
                originalData = results.data;
                analyzeData();
                showOverview();
            }
        },
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        error: function(error) {
            alert('Error parsing CSV file: ' + error.message);
        }
    });
}

// Process Excel file
function processExcel(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get first worksheet
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            
            // Convert to JSON
            originalData = XLSX.utils.sheet_to_json(firstSheet, {
                header: 1,
                defval: null
            });
            
            // Convert to proper format with headers
            if (originalData.length > 1) {
                const headers = originalData[0];
                const rows = originalData.slice(1);
                
                originalData = rows.map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index];
                    });
                    return obj;
                });
                
                analyzeData();
                showOverview();
            }
        } catch (error) {
            alert('Error parsing Excel file: ' + error.message);
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Analyze data for quality issues
function analyzeData() {
    if (!originalData || originalData.length === 0) return;
    
    dataAnalysis = {
        totalRows: originalData.length,
        totalColumns: Object.keys(originalData[0]).length,
        columns: {},
        duplicates: 0,
        totalMissing: 0
    };
    
    const columns = Object.keys(originalData[0]);
    
    // Analyze each column
    columns.forEach(column => {
        const columnData = originalData.map(row => row[column]);
        const analysis = analyzeColumn(column, columnData);
        dataAnalysis.columns[column] = analysis;
        dataAnalysis.totalMissing += analysis.missingCount;
    });
    
    // Find duplicates
    dataAnalysis.duplicates = findDuplicates(originalData);
}

// Analyze individual column
function analyzeColumn(columnName, columnData) {
    const analysis = {
        name: columnName,
        dataType: detectDataType(columnData),
        missingCount: 0,
        missingPercentage: 0,
        uniqueCount: 0,
        issues: []
    };
    
    // Count missing values
    analysis.missingCount = columnData.filter(val => 
        val === null || val === undefined || val === '' || 
        (typeof val === 'string' && val.trim() === '')
    ).length;
    
    analysis.missingPercentage = (analysis.missingCount / columnData.length * 100).toFixed(1);
    
    // Count unique values
    const uniqueValues = new Set(columnData.filter(val => val !== null && val !== undefined && val !== ''));
    analysis.uniqueCount = uniqueValues.size;
    
    // Detect issues
    if (analysis.missingPercentage > 0) {
        analysis.issues.push({
            type: 'missing',
            severity: analysis.missingPercentage > 30 ? 'high' : analysis.missingPercentage > 10 ? 'medium' : 'low',
            message: `${analysis.missingPercentage}% missing values`,
            suggestion: getSuggestionForMissing(analysis.dataType, analysis.missingPercentage)
        });
    }
    
    // Detect outliers for numeric columns
    if (analysis.dataType === 'numeric') {
        const outliers = detectOutliers(columnData);
        if (outliers.length > 0) {
            analysis.issues.push({
                type: 'outliers',
                severity: outliers.length > columnData.length * 0.05 ? 'high' : 'medium',
                message: `${outliers.length} potential outliers detected`,
                suggestion: 'Consider removing or transforming outliers'
            });
        }
    }
    
    return analysis;
}

// Detect data type
function detectDataType(columnData) {
    const nonEmptyData = columnData.filter(val => val !== null && val !== undefined && val !== '');
    
    if (nonEmptyData.length === 0) return 'empty';
    
    // Check if all values are numbers
    const numericCount = nonEmptyData.filter(val => !isNaN(val) && val !== '').length;
    if (numericCount / nonEmptyData.length > 0.8) {
        return 'numeric';
    }
    
    // Check if all values are dates
    const dateCount = nonEmptyData.filter(val => !isNaN(Date.parse(val)) && val !== '').length;
    if (dateCount / nonEmptyData.length > 0.8) {
        return 'date';
    }
    
    // Check if boolean
    const booleanCount = nonEmptyData.filter(val => 
        typeof val === 'boolean' || 
        (typeof val === 'string' && ['true', 'false', 'yes', 'no', '1', '0'].includes(val.toLowerCase()))
    ).length;
    if (booleanCount / nonEmptyData.length > 0.8) {
        return 'boolean';
    }
    
    return 'categorical';
}

// Detect outliers using IQR method
function detectOutliers(columnData) {
    const numericData = columnData.filter(val => !isNaN(val) && val !== null && val !== undefined);
    
    if (numericData.length < 4) return [];
    
    numericData.sort((a, b) => a - b);
    
    const q1Index = Math.floor(numericData.length * 0.25);
    const q3Index = Math.floor(numericData.length * 0.75);
    
    const q1 = numericData[q1Index];
    const q3 = numericData[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return numericData.filter(val => val < lowerBound || val > upperBound);
}

// Find duplicate rows
function findDuplicates(data) {
    const seen = new Set();
    let duplicates = 0;
    
    data.forEach(row => {
        const rowString = JSON.stringify(row);
        if (seen.has(rowString)) {
            duplicates++;
        } else {
            seen.add(rowString);
        }
    });
    
    return duplicates;
}

// Get suggestion for missing values
function getSuggestionForMissing(dataType, missingPercentage) {
    if (missingPercentage > 50) {
        return 'Consider removing this column';
    } else if (missingPercentage > 30) {
        return 'High missing rate - consider imputation or removal';
    }
    
    switch (dataType) {
        case 'numeric':
            return 'Fill with mean, median, or mode';
        case 'categorical':
            return 'Fill with mode or "Unknown" category';
        case 'date':
            return 'Fill with forward/backward fill or remove';
        default:
            return 'Fill with appropriate default value';
    }
}

// Show data overview
function showOverview() {
    // Update statistics
    document.getElementById('totalRows').textContent = dataAnalysis.totalRows.toLocaleString();
    document.getElementById('totalColumns').textContent = dataAnalysis.totalColumns;
    document.getElementById('totalMissing').textContent = dataAnalysis.totalMissing.toLocaleString();
    document.getElementById('totalDuplicates').textContent = dataAnalysis.duplicates.toLocaleString();
    
    // Update column table
    updateColumnTable();
    
    // Show overview section
    document.getElementById('overviewSection').classList.remove('hidden');
    
    // Show issues section
    showIssues();
}

// Update column table
function updateColumnTable() {
    const tbody = document.getElementById('columnTableBody');
    tbody.innerHTML = '';
    
    Object.values(dataAnalysis.columns).forEach(column => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const severityColor = column.issues.length > 0 ? 
            (column.issues.some(issue => issue.severity === 'high') ? 'text-red-600' : 
             column.issues.some(issue => issue.severity === 'medium') ? 'text-yellow-600' : 'text-blue-600') : 
            'text-green-600';
        
        row.innerHTML = `
            <td class="border border-gray-200 px-4 py-2 font-medium">${column.name}</td>
            <td class="border border-gray-200 px-4 py-2">
                <span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">${column.dataType}</span>
            </td>
            <td class="border border-gray-200 px-4 py-2">
                <span class="${column.missingPercentage > 30 ? 'text-red-600 font-semibold' : column.missingPercentage > 10 ? 'text-yellow-600' : 'text-gray-600'}">
                    ${column.missingPercentage}%
                </span>
            </td>
            <td class="border border-gray-200 px-4 py-2">${column.uniqueCount.toLocaleString()}</td>
            <td class="border border-gray-200 px-4 py-2">
                ${column.issues.length > 0 ? 
                    `<span class="${severityColor}"><i class="fas fa-exclamation-triangle mr-1"></i>${column.issues.length} issues</span>` : 
                    '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>Good</span>'}
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Show issues and recommendations
function showIssues() {
    const container = document.getElementById('issuesContainer');
    container.innerHTML = '';
    
    let allIssues = [];
    
    // Collect all issues
    Object.values(dataAnalysis.columns).forEach(column => {
        column.issues.forEach(issue => {
            allIssues.push({
                ...issue,
                column: column.name,
                dataType: column.dataType
            });
        });
    });
    
    // Add duplicate issue if any
    if (dataAnalysis.duplicates > 0) {
        allIssues.push({
            type: 'duplicates',
            severity: dataAnalysis.duplicates > dataAnalysis.totalRows * 0.1 ? 'high' : 'medium',
            message: `${dataAnalysis.duplicates} duplicate rows found`,
            suggestion: 'Remove duplicate rows to improve data quality',
            column: 'All Columns'
        });
    }
    
    // Sort by severity
    allIssues.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
    });
    
    // Display issues
    allIssues.forEach((issue, index) => {
        const issueCard = createIssueCard(issue, index);
        container.appendChild(issueCard);
    });
    
    // Show issues section
    document.getElementById('issuesSection').classList.remove('hidden');
}

// Create issue card
function createIssueCard(issue, index) {
    const card = document.createElement('div');
    card.className = `issue-card bg-white border rounded-lg p-4 fade-in`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    const severityColors = {
        high: 'border-red-200 bg-red-50',
        medium: 'border-yellow-200 bg-yellow-50',
        low: 'border-blue-200 bg-blue-50'
    };
    
    const severityIcons = {
        high: 'fas fa-exclamation-circle text-red-500',
        medium: 'fas fa-exclamation-triangle text-yellow-500',
        low: 'fas fa-info-circle text-blue-500'
    };
    
    card.className += ' ' + severityColors[issue.severity];
    
    card.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex items-start space-x-3">
                <i class="${severityIcons[issue.severity]} mt-1"></i>
                <div>
                    <h4 class="font-semibold text-gray-800">${issue.column}</h4>
                    <p class="text-gray-600 text-sm mt-1">${issue.message}</p>
                    <div class="mt-2">
                        <p class="text-sm font-medium text-gray-700">Recommended Action:</p>
                        <p class="text-sm text-gray-600">${issue.suggestion}</p>
                    </div>
                </div>
            </div>
            <span class="px-2 py-1 text-xs rounded-full bg-white ${
                issue.severity === 'high' ? 'text-red-600' : 
                issue.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
            }">
                ${issue.severity.toUpperCase()}
            </span>
        </div>
    `;
    
    return card;
}

// Start cleaning process
function startCleaning() {
    // Show cleaning section
    document.getElementById('cleaningSection').classList.remove('hidden');
    document.getElementById('issuesSection').classList.add('hidden');
    
    // Initialize cleaning stats
    cleaningStats = {
        missingFixed: 0,
        duplicatesRemoved: 0,
        outliersHandled: 0
    };
    
    // Start cleaning process
    cleanData();
}

// Clean data
function cleanData() {
    const progressContainer = document.getElementById('cleaningProgress');
    progressContainer.innerHTML = '';
    
    // Make a copy of original data
    cleanedData = JSON.parse(JSON.stringify(originalData));
    
    const cleaningSteps = [];
    
    // Step 1: Handle missing values
    Object.values(dataAnalysis.columns).forEach(column => {
        if (column.missingCount > 0) {
            cleaningSteps.push({
                name: `Fix missing values in "${column.name}"`,
                action: () => fixMissingValues(column.name, column.dataType),
                status: 'pending'
            });
        }
    });
    
    // Step 2: Handle duplicates
    if (dataAnalysis.duplicates > 0) {
        cleaningSteps.push({
            name: 'Remove duplicate rows',
            action: () => removeDuplicates(),
            status: 'pending'
        });
    }
    
    // Step 3: Handle outliers
    Object.values(dataAnalysis.columns).forEach(column => {
        if (column.issues.some(issue => issue.type === 'outliers')) {
            cleaningSteps.push({
                name: `Handle outliers in "${column.name}"`,
                action: () => handleOutliers(column.name),
                status: 'pending'
            });
        }
    });
    
    // Execute cleaning steps
    executeCleaningSteps(cleaningSteps, 0);
}

// Execute cleaning steps with progress
function executeCleaningSteps(steps, index) {
    if (index >= steps.length) {
        // All steps completed
        showResults();
        return;
    }
    
    const step = steps[index];
    const progressContainer = document.getElementById('cleaningProgress');
    
    // Create step element
    const stepElement = document.createElement('div');
    stepElement.className = 'flex items-center space-x-3 p-3 bg-gray-50 rounded-lg';
    stepElement.innerHTML = `
        <div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
        <span class="text-gray-700">${step.name}...</span>
    `;
    progressContainer.appendChild(stepElement);
    
    // Execute step
    setTimeout(() => {
        step.action();
        
        // Update step element
        stepElement.innerHTML = `
            <i class="fas fa-check-circle text-green-500"></i>
            <span class="text-gray-700">${step.name} - Complete</span>
        `;
        
        // Execute next step
        executeCleaningSteps(steps, index + 1);
    }, 1000);
}

// Fix missing values
function fixMissingValues(columnName, dataType) {
    let fillValue;
    
    switch (dataType) {
        case 'numeric':
            // Use median for numeric data
            const numericValues = cleanedData
                .map(row => row[columnName])
                .filter(val => !isNaN(val) && val !== null && val !== undefined);
            
            if (numericValues.length > 0) {
                numericValues.sort((a, b) => a - b);
                const medianIndex = Math.floor(numericValues.length / 2);
                fillValue = numericValues[medianIndex];
            } else {
                fillValue = 0;
            }
            break;
            
        case 'categorical':
            // Use mode for categorical data
            const categoricalValues = cleanedData
                .map(row => row[columnName])
                .filter(val => val !== null && val !== undefined && val !== '');
            
            if (categoricalValues.length > 0) {
                const frequency = {};
                categoricalValues.forEach(val => {
                    frequency[val] = (frequency[val] || 0) + 1;
                });
                fillValue = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
            } else {
                fillValue = 'Unknown';
            }
            break;
            
        default:
            fillValue = dataType === 'date' ? new Date().toISOString().split('T')[0] : 'Unknown';
    }
    
    // Fill missing values
    let fixedCount = 0;
    cleanedData.forEach(row => {
        if (row[columnName] === null || row[columnName] === undefined || row[columnName] === '' || 
            (typeof row[columnName] === 'string' && row[columnName].trim() === '')) {
            row[columnName] = fillValue;
            fixedCount++;
        }
    });
    
    cleaningStats.missingFixed += fixedCount;
}

// Remove duplicates
function removeDuplicates() {
    const uniqueData = [];
    const seen = new Set();
    
    cleanedData.forEach(row => {
        const rowString = JSON.stringify(row);
        if (!seen.has(rowString)) {
            seen.add(rowString);
            uniqueData.push(row);
        }
    });
    
    const removedCount = cleanedData.length - uniqueData.length;
    cleaningStats.duplicatesRemoved = removedCount;
    cleanedData = uniqueData;
}

// Handle outliers
function handleOutliers(columnName) {
    const columnData = cleanedData.map(row => row[columnName]).filter(val => !isNaN(val));
    
    if (columnData.length < 4) return;
    
    columnData.sort((a, b) => a - b);
    
    const q1Index = Math.floor(columnData.length * 0.25);
    const q3Index = Math.floor(columnData.length * 0.75);
    
    const q1 = columnData[q1Index];
    const q3 = columnData[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    let handledCount = 0;
    cleanedData.forEach(row => {
        const value = row[columnName];
        if (!isNaN(value) && (value < lowerBound || value > upperBound)) {
            // Cap outliers to bounds
            row[columnName] = value < lowerBound ? lowerBound : upperBound;
            handledCount++;
        }
    });
    
    cleaningStats.outliersHandled += handledCount;
}

// Show results
function showResults() {
    // Calculate quality score
    const totalIssues = dataAnalysis.totalMissing + dataAnalysis.duplicates + 
        Object.values(dataAnalysis.columns).reduce((sum, col) => 
            sum + col.issues.filter(issue => issue.type === 'outliers').length, 0);
    
    const totalFixed = cleaningStats.missingFixed + cleaningStats.duplicatesRemoved + cleaningStats.outliersHandled;
    const qualityScore = totalIssues > 0 ? Math.round((totalFixed / totalIssues) * 100) : 100;
    
    // Update statistics
    document.getElementById('missingFixed').textContent = cleaningStats.missingFixed.toLocaleString();
    document.getElementById('duplicatesRemoved').textContent = cleaningStats.duplicatesRemoved.toLocaleString();
    document.getElementById('outliersHandled').textContent = cleaningStats.outliersHandled.toLocaleString();
    document.getElementById('qualityScore').textContent = qualityScore + '%';
    
    // Show preview table
    showPreviewTable();
    
    // Show results section
    document.getElementById('cleaningSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
}

// Show preview table
function showPreviewTable() {
    const table = document.getElementById('previewTable');
    table.innerHTML = '';
    
    if (cleanedData.length === 0) return;
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.className = 'bg-gray-50';
    
    Object.keys(cleanedData[0]).forEach(key => {
        const th = document.createElement('th');
        th.className = 'border border-gray-200 px-4 py-2 text-left text-sm font-semibold text-gray-700';
        th.textContent = key;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body (show first 10 rows)
    const tbody = document.createElement('tbody');
    const previewRows = cleanedData.slice(0, 10);
    
    previewRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.className = 'border border-gray-200 px-4 py-2 text-sm text-gray-600';
            td.textContent = value !== null && value !== undefined ? value : '';
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    
    // Add note if there are more rows
    if (cleanedData.length > 10) {
        const note = document.createElement('div');
        note.className = 'text-sm text-gray-500 mt-2 text-center';
        note.textContent = `Showing 10 of ${cleanedData.length} rows`;
        table.parentNode.appendChild(note);
    }
}

// Download as CSV
function downloadCSV() {
    if (cleanedData.length === 0) {
        alert('No data to download');
        return;
    }
    
    const csv = Papa.unparse(cleanedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'cleaned_data.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Download as Excel
function downloadExcel() {
    if (cleanedData.length === 0) {
        alert('No data to download');
        return;
    }
    
    const ws = XLSX.utils.json_to_sheet(cleanedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Data');
    
    XLSX.writeFile(wb, 'cleaned_data.xlsx');
}

// Remove file
function removeFile() {
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    
    // Reset all sections
    document.getElementById('overviewSection').classList.add('hidden');
    document.getElementById('issuesSection').classList.add('hidden');
    document.getElementById('cleaningSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    
    // Reset data
    originalData = [];
    cleanedData = [];
    dataAnalysis = {};
    cleaningStats = {
        missingFixed: 0,
        duplicatesRemoved: 0,
        outliersHandled: 0
    };
}

// Reset application
function resetApp() {
    removeFile();
}
