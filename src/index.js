import Giphy from './lib/giphy'
import GiphyToolbarItem from './components/giphy-toolbar-item'
import LoadingIndicator from './components/loading-indicator'
import Masonry from 'masonry-layout'
import debounce from 'debounce-fn'
import delegate from 'delegate'
import gitHubInjection from 'github-injection'
import { h } from 'dom-chef'
import observeEl from './lib/simplified-element-observer'
import onetime from 'onetime'
import select from 'select-dom'

// Create a new Giphy Client
const giphyClient = new Giphy('Mpy5mv1k9JRY2rt7YBME2eFRGNs7EGvQ')

/**
 * Responds to the GIPHY modal being opened or closed.
 */
function watchGiphyModals () {
  for (const trigger of select.all('.ghg-trigger')) {
    observeEl(
      trigger,
      async () => {
        // The modal has been opened.
        if (trigger.hasAttribute('open')) {
          const parent = trigger.closest('.ghg-has-giphy-field')
          const resultsContainer = select('.ghg-giphy-results', parent)
          const searchInput = select('.ghg-search-input', parent)
          const initInfiniteScroll = onetime(bindInfiniteScroll.bind(this, resultsContainer))

          // Bind the scroll event to the results container
          initInfiniteScroll()

          // If the modal has been opened and there is no search term,
          // and no search results, load the trending gifs
          if (searchInput.value === '' && resultsContainer.dataset.hasResults === 'false') {
            // Set the loading state
            resultsContainer.append(<div>{LoadingIndicator}</div>)

            // Fetch the trending gifs
            const gifs = await giphyClient.getTrending()

            // Clear the loading indicator
            resultsContainer.innerHTML = ''

            // Add the gifs to the results container
            if (gifs && gifs.length) {
              appendResults(resultsContainer, gifs)
            } else {
              showNoResultsFound(resultsContainer)
            }
          } else {
            // Otherwise ensure masonry has been called.
            const masonry = new Masonry(
              resultsContainer,
              {
                itemSelector: '.ghg-giphy-results div',
                columnWidth: 145,
                gutter: 10,
                transitionDuration: '0.2s'
                // fitWidth: true
              },
              2000
            )
          }
        }
      },
      { attributes: true } // observe attributes, we are interested in the 'open' attribute
    )
  }
}

/**
 * Adds the GIF toolbar button to all WYSIWYG instances.
 */
function addToolbarButton () {
  for (const toolbar of select.all('form:not(.ghg-has-giphy-field) markdown-toolbar')) {
    const form = toolbar.closest('form')

    // Observe the toolbars without the giphy field, add
    // the toolbar item to any new toolbars.
    observeEl(toolbar, () => {
      const toolbarGroup = select('.toolbar-commenting .d-inline-block:last-child', toolbar);
      if (toolbarGroup) {
        console.log('The toolbar is visible, add the GIF button')
        // Append the Giphy button to the toolbar
        // cloneNode is necessary, without it, it will only be appended to the last toolbarGroup
        toolbarGroup.append(GiphyToolbarItem.cloneNode(true))
        form.classList.add('ghg-has-giphy-field')
      } else {
        console.log('The toolbar is not visible, do nothing')
      }
    })
  }
}

/**
 * Watches for comments that might be dynamically added, then adds the button the the WYSIWYG when they are.
 */
function observeDiscussion () {
  const discussionTimeline = select('.js-discussion')

  observeEl(discussionTimeline, () => {
    addToolbarButton()
  })
}

/**
 * Resets GIPHY modals by clearing the search input field, any
 * results, and all data attributes.
 */
function resetGiphyModals () {
  for (const ghgModal of select.all('.ghg-modal')) {
    const resultContainer = select('.ghg-giphy-results', ghgModal)
    const searchInput = select('.ghg-search-input', ghgModal)
    searchInput.value = ''
    resultContainer.innerHTML = ''
    resultContainer.dataset.offset = 0
    resultContainer.dataset.searchQuery = ''
    resultContainer.dataset.hasResults = false
  }
}

/**
 * Perform a search of the GIPHY API and append the results
 * to the modal.
 */
async function performSearch (event) {
  event.preventDefault()
  const searchQuery = event.target.value
  const parent = event.target.closest('.ghg-has-giphy-field')
  const resultsContainer = select('.ghg-giphy-results', parent)
  let gifs

  resultsContainer.dataset.offset = 0
  resultsContainer.dataset.searchQuery = searchQuery

  // Show a loading indicator
  resultsContainer.append(<div>{LoadingIndicator}</div>)

  // If there is no search query, get the trending gifs
  if (searchQuery === '') {
    gifs = await giphyClient.getTrending()
  } else {
    gifs = await giphyClient.search(searchQuery)
  }

  // Clear any previous results
  resultsContainer.innerHTML = ''

  // Add the GIFs to the results container
  if (gifs && gifs.length) {
    appendResults(resultsContainer, gifs)
  } else {
    showNoResultsFound(resultsContainer)
  }
}

/**
 * Returns a GIF in the format required to display in the modal search results.
 */
function getFormattedGif (gif) {
  const MAX_GIF_WIDTH = 145

  // Github has a 10MB image upload limit,
  // however, when embedding an image URL
  // in a Github comment box, Github will proxy
  // the image and if the image is above 5MB it fails.
  const GITHUB_MAX_SIZE = 5 * 1024 * 1024
  let fullSizeUrl
  let downsampledUrl = gif.images.fixed_width_downsampled.url

  if (gif.images.original.size < GITHUB_MAX_SIZE) {
    fullSizeUrl = gif.images.original.url
  } else if (gif.images.downsized_medium.size < GITHUB_MAX_SIZE) {
    fullSizeUrl = gif.images.downsized_medium.url
  } else if (gif.images.fixed_width.size < GITHUB_MAX_SIZE) {
    fullSizeUrl = gif.images.fixed_width.url
  } else {
    fullSizeUrl = downsampledUrl
  }

  const height = Math.floor((gif.images.fixed_width.height * MAX_GIF_WIDTH) / gif.images.fixed_width.width)

  // Generate a random pastel colour to use as an image placeholder
  const Hsl = 'hsl(' + 360 * Math.random() + ',' + (25 + 70 * Math.random()) + '%,' + (85 + 10 * Math.random()) + '%)'

  return (
    <div
      style={{
        width: `${MAX_GIF_WIDTH}px`
      }}
    >
      <img
        src={downsampledUrl}
        height={height}
        style={{ 'background-color': Hsl }}
        data-full-size-url={fullSizeUrl}
        class='ghg-gif-selection'
      />
    </div>
  )
}

function showNoResultsFound (resultsContainer) {
  resultsContainer.append(<div class='ghg-no-results-found'>No GIFs found.</div>)
}

/**
 * Appends a collection of GIFs to the provided result container.
 */
function appendResults (resultsContainer, gifs) {
  resultsContainer.dataset.hasResults = true

  const gifsToAdd = []

  gifs.forEach(gif => {
    const img = getFormattedGif(gif)
    gifsToAdd.push(img)
    resultsContainer.append(img)
  })

  const masonry = new Masonry(
    resultsContainer,
    {
      itemSelector: '.ghg-giphy-results div',
      columnWidth: 145,
      gutter: 10,
      transitionDuration: '0.2s'
      // fitWidth: true
    },
    2000
  )
}

function insertText (textarea, content) {
  const selectionEnd = textarea.selectionEnd
  const startText = textarea.value.substring(0, selectionEnd)
  const endText = textarea.value.substring(selectionEnd)
  const value = textarea.value === '' || startText.match(/\n$/) ? '' : '\n'

  textarea.value = startText + value + content + endText
  textarea.selectionStart = selectionEnd + content.length
  textarea.selectionEnd = selectionEnd + content.length
  textarea.focus()
}

/**
 * Invoked when a GIF from the result set has been clicked.
 *
 * Closes the GIPHY modal and inserts the selected GIF in the textarea.
 */
function selectGif (e) {
  const form = e.target.closest('.ghg-has-giphy-field')
  const commentField = select('.js-comment-field', form)
  const trigger = select('.ghg-trigger', form)
  const gifUrl = e.target.dataset.fullSizeUrl
  const textArea = select('.js-comment-field', form)

  // Close the modal
  trigger.removeAttribute('open')

  // Focuses the textarea and inserts the text where the cursor was last

  insertText(textArea, `![](${gifUrl})`)
}

/**
 * Prevents the outer form from submitting when enter is pressed in the GIF search
 * input.
 */
function preventFormSubmitOnEnter (e) {
  if (e.keyCode == 13) {
    e.preventDefault()
    return false
  }
}

function bindInfiniteScroll (resultsContainer) {
  resultsContainer.addEventListener('scroll', handleInfiniteScroll)
}

let searchTimer
function handleInfiniteScroll (event) {
  const resultsContainer = event.target
  const currentScrollPosition = resultsContainer.scrollTop + 395
  const INFINITE_SCROLL_PX_OFFSET = 100

  if (currentScrollPosition + INFINITE_SCROLL_PX_OFFSET > parseInt(resultsContainer.style.height)) {
    // start the infinite scroll after the last scroll event
    clearTimeout(searchTimer)

    searchTimer = setTimeout(async function (event) {
      const offset = resultsContainer.dataset.offset ? parseInt(resultsContainer.dataset.offset) + 50 : 50
      const searchQuery = resultsContainer.dataset.searchQuery
      let gifs

      resultsContainer.dataset.offset = offset

      if (searchQuery) {
        gifs = await giphyClient.search(searchQuery, offset)
      } else {
        gifs = await giphyClient.getTrending(offset)
      }

      appendResults(resultsContainer, gifs)
    }, 250)
  }
}

/**
 * Defines the event listeners
 */
function listen () {
  delegate('.ghg-gif-selection', 'click', selectGif)
  delegate('.ghg-has-giphy-field .ghg-search-input', 'keydown', debounce(performSearch, { wait: 400 }))
  delegate('.ghg-has-giphy-field .ghg-search-input', 'keypress', preventFormSubmitOnEnter)
}

// Ensure we only bind events to elements once
const listenOnce = onetime(listen)

// gitHubInjection fires when there's a pjax:end event
// on github, this happens when a page is loaded
gitHubInjection(() => {
  addToolbarButton()
  listenOnce()
  observeDiscussion()
  // Clears all gif search input fields and results.
  // We have to do this because when navigating, github will refuse to
  // load the giphy URLs as it violates their Content Security Policy.
  resetGiphyModals()
  watchGiphyModals()
})
