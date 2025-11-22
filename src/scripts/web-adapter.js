/**
 * Web Adapter for Electron IPC
 * Mocks ipcRenderer for web environment
 */

if (typeof window !== 'undefined' && !window.ipcRenderer) {
    window.ipcRenderer = {
        invoke: async (channel, ...args) => {
            console.log(`[Web Adapter] invoke: ${channel}`, args);

            switch (channel) {
                case 'read-file':
                    // Use FileSystemAdapter to read file
                    if (window.FileSystemAdapter) {
                        return await window.FileSystemAdapter.readFile(args[0]);
                    }
                    return { success: false, error: 'FileSystemAdapter not found' };

                case 'load-annotations':
                    // Mock loading annotations
                    return { success: true, data: { highlights: [], underlines: [] } };

                case 'save-annotations':
                    // Mock saving annotations
                    console.log('[Web Adapter] Saving annotations:', args);
                    return { success: true };

                default:
                    console.warn(`[Web Adapter] Unhandled invoke channel: ${channel}`);
                    return { success: false, error: `Unhandled channel: ${channel}` };
            }
        },

        on: (channel, listener) => {
            console.log(`[Web Adapter] on: ${channel}`);
            // Store listener if needed, or just ignore for now
        },

        send: (channel, ...args) => {
            console.log(`[Web Adapter] send: ${channel}`, args);
        },

        removeListener: (channel, listener) => {
            console.log(`[Web Adapter] removeListener: ${channel}`);
        }
    };

    // Mock window.require for electron
    window.require = (module) => {
        if (module === 'electron') {
            return { ipcRenderer: window.ipcRenderer };
        }
        throw new Error(`Module ${module} not found in web adapter`);
    };
}
