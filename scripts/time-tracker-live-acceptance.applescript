-- Read-only signed-runtime acceptance for the deployed APSYNTRA CRM TimeTracker app.
-- Run on macOS with the signed CRM session already open in Chromium:
--   osascript scripts/time-tracker-live-acceptance.applescript
-- This script navigates the active APSYNTRA CRM tab and clicks navigation tabs only.
-- It never clicks Clock In/Out, Submit OT, correction, approval, or data mutation controls.

on run
  tell application "Chromium"
    if (count of windows) is 0 then error "Chromium has no open window. Sign in to APSYNTRA CRM first."
    set activeTab to active tab of front window
    set activeUrl to URL of activeTab
    if activeUrl does not start with "https://wass-psti.github.io/APSYNTRACRM" then
      error "The active Chromium tab is not the APSYNTRA CRM GitHub Pages application."
    end if
    set URL of activeTab to "https://wass-psti.github.io/APSYNTRACRM/#/time-tracker"
    delay 2

    tell activeTab
      set readyState to "WAITING"
      repeat with attempt from 1 to 20
        set readyState to execute javascript "(()=>{if(location.hash!=='#/time-tracker')return 'WAIT_ROUTE';if(!document.querySelector('.tt-native'))return 'WAIT_RENDER';if(!document.querySelector('.fm1-app.tt-application'))return 'WAIT_SHELL';if(![...document.querySelectorAll('button[aria-label]')].some(button=>(button.getAttribute('aria-label')||'').startsWith('Live synced · Authorized Realtime connected')))return 'WAIT_SIGNED_READ';return 'READY'})()"
        if readyState is "READY" then exit repeat
        delay 1
      end repeat
      if readyState is not "READY" then error "Dedicated TimeTracker route did not reach the FM1 application shell: " & readyState

      set initialState to execute javascript "(()=>{const app=document.querySelector('.tt-native .fm1-app.tt-application');return JSON.stringify({route:location.hash,title:app?.querySelector('h1')?.innerText||'',appShell:!!app,attendanceRoot:!!document.querySelector('.tt-native'),genericBoardControls:!!document.querySelector('.board-customize-toolbar,#search-board-items'),tabs:[...document.querySelectorAll('[data-action=tt-tab]')].map(x=>x.dataset.target)})})()"
      set results to {"INITIAL " & initialState}

      set viewNames to {"overview", "clock", "log", "reports", "calendar", "ot", "hours", "team", "monitor", "gps"}
      repeat with viewName in viewNames
        set targetName to viewName as text
        set clickState to execute javascript "(()=>{const tab=document.querySelector('[data-action=tt-tab][data-target=\"" & targetName & "\"]');if(!tab)return 'NOT_AVAILABLE';tab.click();return 'CLICKED'})()"
        if clickState is "CLICKED" then
          set viewState to "WAITING"
          repeat with viewAttempt from 1 to 8
            delay 1
            set viewState to execute javascript "(()=>{const selected=document.querySelector('[data-action=tt-tab][data-target=\"" & targetName & "\"]');const root=document.querySelector('.tt-native .fm1-app.tt-application');return JSON.stringify({view:'" & targetName & "',selected:selected?.getAttribute('aria-selected')==='true',appShell:!!root,contentLength:root?.innerText.length||0})})()"
            if viewState contains "\"selected\":true" then exit repeat
          end repeat
          if viewState does not contain "\"selected\":true" then error "TimeTracker navigation did not select " & targetName & ": " & viewState
          if viewState does not contain "\"appShell\":true" then error "TimeTracker application shell disappeared on " & targetName
          set end of results to "PASS " & viewState
        else
          set end of results to "SKIP " & targetName & " is not present for this signed session"
        end if
      end repeat

      set clockTabState to execute javascript "(()=>{const tab=document.querySelector('[data-action=tt-tab][data-target=clock]');if(tab)tab.click();return 'CLOCK_RESTORED'})()"
      repeat with clockAttempt from 1 to 8
        delay 1
        set clockTabState to execute javascript "document.querySelector('[data-action=tt-tab][data-target=clock]')?.getAttribute('aria-selected')==='true'?'CLOCK_RESTORED':'WAIT_CLOCK'"
        if clockTabState is "CLOCK_RESTORED" then exit repeat
      end repeat
      if clockTabState is not "CLOCK_RESTORED" then error "Could not restore the read-only Clock view after acceptance."

      set finalState to execute javascript "JSON.stringify({route:location.hash,appShell:!!document.querySelector('.tt-native .fm1-app.tt-application'),genericBoardControls:!!document.querySelector('.board-customize-toolbar,#search-board-items'),clockSelected:document.querySelector('[data-action=tt-tab][data-target=clock]')?.getAttribute('aria-selected')==='true'})"
      if finalState does not contain "\"route\":\"#/time-tracker\"" then error "TimeTracker left its dedicated route: " & finalState
      if finalState does not contain "\"appShell\":true" then error "TimeTracker application shell is not mounted after navigation."
      if finalState contains "\"genericBoardControls\":true" then error "Generic board controls are still mounted in the dedicated TimeTracker application."
      if finalState does not contain "\"clockSelected\":true" then error "TimeTracker did not return to the Clock view."
      return (results as text) & "\nFINAL " & finalState & "\nREAD_ONLY_SIGNED_RUNTIME_ACCEPTANCE_PASS"
    end tell
  end tell
end run
