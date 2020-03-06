---
'@keystonejs/app-admin-ui': minor
---

Enable use of ui hooks for specific List page. To use list specific hooks, create them in the list name key

```js
module.exports = {
    // other hooks
    itemHeaderActions: ActionsForAllPage,
    Post: {
        itemHeaderActions: ActionsForPostPageOnly,
    }
}
```
