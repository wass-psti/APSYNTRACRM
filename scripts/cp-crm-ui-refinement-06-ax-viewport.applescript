-- CP06: inspect ONLY the current APSYNTRA CRM tab in an existing Chromium window.
-- Uses the macOS accessibility tree when Chromium's Apple Events window API
-- reports zero windows. Never launches a browser or changes application data.
-- Screenshots stay in local /tmp and are not published or committed.
set resultLines to ""
tell application "System Events"
 tell process "Chromium"
  if (count of windows) is 0 then error "NO_EXISTING_CHROMIUM_AX_WINDOW"
  set targetWindow to window 1
  if name of targetWindow does not contain "APSYNTRA CRM" then error "EXISTING_CRM_TAB_NOT_SELECTED"
  set originalSize to size of targetWindow
  set originalPosition to position of targetWindow
  set initialTitle to name of targetWindow
  set resultLines to "CP06|ORIGINAL|" & item 1 of originalSize & "|" & item 2 of originalSize & "|" & item 1 of originalPosition & "|" & item 2 of originalPosition & return
  try
   repeat with requestedWidth in {1200, 800, 390}
    set size of targetWindow to {requestedWidth, 850}
    delay 0.6
    if name of targetWindow is not initialTitle then error "CRM_TAB_CHANGED_DURING_AUDIT"
    set measuredSize to size of targetWindow
    set resultLines to resultLines & "CP06|MEASURED|" & requestedWidth & "|" & item 1 of measuredSize & "|" & item 2 of measuredSize & return
    -- Screenshots can include private UI: restrict filesystem permissions.
    do shell script "umask 077; rm -f /tmp/cp-crm-ui06-existing-" & requestedWidth & ".png; screencapture -x -m /tmp/cp-crm-ui06-existing-" & requestedWidth & ".png; chmod 600 /tmp/cp-crm-ui06-existing-" & requestedWidth & ".png"
   end repeat
  on error errText
   set resultLines to resultLines & "CP06|ERROR|" & errText & return
  end try
  -- Restoration errors must not erase previously measured evidence.
  try
   set size of targetWindow to originalSize
  on error restoreSizeError
   set resultLines to resultLines & "CP06|RESTORE_ERROR|SIZE: " & restoreSizeError & return
  end try
  try
   set position of targetWindow to originalPosition
  on error restorePositionError
   set resultLines to resultLines & "CP06|RESTORE_ERROR|POSITION: " & restorePositionError & return
  end try
  delay 0.1
  try
   set restoredSize to size of targetWindow
   set restoredPosition to position of targetWindow
   set resultLines to resultLines & "CP06|RESTORED|" & item 1 of restoredSize & "|" & item 2 of restoredSize & "|" & item 1 of restoredPosition & "|" & item 2 of restoredPosition & return
  on error restoreReadError
   set resultLines to resultLines & "CP06|RESTORE_ERROR|READBACK: " & restoreReadError & return
  end try
 end tell
end tell
return resultLines
