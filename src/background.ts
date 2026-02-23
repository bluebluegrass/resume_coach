async function enforceSidePanelOnly(): Promise<void> {
  await chrome.action.setPopup({ popup: "" });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

void enforceSidePanelOnly();

chrome.runtime.onInstalled.addListener(() => {
  void enforceSidePanelOnly();
});

chrome.runtime.onStartup.addListener(() => {
  void enforceSidePanelOnly();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.windowId) {
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
});
