# Fix Screen Alignment Gaps and Sidebar Border

## Issues Identified

1. **Top Gap in Create a Task**: `Screen1Consultant` uses `h-screen` but is nested inside a flex container, causing misalignment with the sidebar top. Header padding (`p-6`) doesn't match sidebar logo padding (`p-5`).

2. **Bottom Gap in Create a Task**: Input area padding (`p-6`) doesn't match sidebar user section padding (`p-4`), causing bottom misalignment.

3. **Top Gap in Workflows**: `Screen3Workflows` uses `h-screen` but is nested inside a flex container. Header padding (`p-6`) doesn't match sidebar logo padding (`p-5`).

4. **Sidebar Border**: Sidebar currently uses `shadow-fluent` but needs an explicit right border (`border-r`) to distinguish it from the main content area.

## Changes Required

### 1. Fix Height Constraints
- **File**: `src/components/Screen1Consultant.tsx`
  - Line 310: Change `<div className="flex flex-col h-screen bg-neutral-50">` to `<div className="flex flex-col h-full bg-neutral-50">`

- **File**: `src/components/Screen3Workflows.tsx`
  - Line 78: Change `<div className="flex h-screen bg-neutral-50">` to `<div className="flex h-full bg-neutral-50">`

### 2. Align Top Padding in Create a Task
- **File**: `src/components/Screen1Consultant.tsx`
  - Line 312: Change header padding from `p-6` to `p-5` to match sidebar logo section

### 3. Align Top Padding in Workflows
- **File**: `src/components/Screen3Workflows.tsx`
  - Line 82: Change left panel header padding from `p-6` to `p-5` to match sidebar logo section
  - Line 150: Change right panel header padding from `p-6` to `p-5` to match sidebar logo section

### 4. Align Bottom Padding in Create a Task
- **File**: `src/components/Screen1Consultant.tsx`
  - Line 398: Change input area padding from `p-6` to `p-4` to match sidebar user section

### 5. Add Right Border to Sidebar
- **File**: `src/components/Sidebar.tsx`
  - Line 26: Change `<div className="flex flex-col h-screen w-64 bg-white shadow-fluent">` to `<div className="flex flex-col h-screen w-64 bg-white border-r border-neutral-200 shadow-fluent">`
  - This adds a right border while keeping the shadow for depth

## Expected Result

- No gap at the top between sidebar and main content headers in both Create a Task and Workflows screens
- No gap at the bottom between sidebar user section and input area in Create a Task screen
- Sidebar has a clear right border distinguishing it from the main content area
- All sections align perfectly vertically
