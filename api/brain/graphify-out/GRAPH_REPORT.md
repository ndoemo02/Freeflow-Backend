# Graph Report - C:\Firerfox Portable\Freeflow brain\backend\api\brain  (2026-04-15)

## Corpus Check
- 114 files · ~145,942 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 677 nodes · 1038 edges · 110 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `runNamedGuard()` - 15 edges
2. `resolveOrderCandidate()` - 15 edges
3. `normalizeText()` - 12 edges
4. `normalizeLooseText()` - 11 edges
5. `handleParsedOrderFlow()` - 11 edges
6. `tryWholePhraseSingleItem()` - 10 edges
7. `initEntityCache()` - 9 edges
8. `ensureSessionId()` - 9 edges
9. `setSession()` - 9 edges
10. `getSession()` - 9 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (39): buildAmbiguousResolution(), buildClarifyResponse(), buildModifierVariants(), buildRestaurantSwitchConflictResponse(), buildSharedBaseClarifyReply(), collectMenuCandidates(), computeModifierMatchQuality(), dedupeMenuItems() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (25): buildItemAliases(), buildItemSearchCorpus(), escapeRegex(), extractItemQueryCandidate(), fetchCityMenuRows(), FindRestaurantHandler, formatDiscoveryReply(), getCuisineSearchVariants() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.24
Nodes (20): classifyMenuItem(), cleanSegmentText(), collapseRepeatedDishTokens(), collapseServingPhraseToSingleMain(), extractModifier(), extractQuantityFromSegment(), findMenuEntryForResolvedDish(), generatePhraseVariants() (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.27
Nodes (20): disableSupabase(), ensureSessionId(), getErrorMessage(), getSupabase(), hasSupabaseConfig(), isExpired(), isMissingTableError(), isSchemaMismatchError() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (13): applyAliases(), baseDishKey(), dedupHitsByBase(), detectIntent(), extractRequestedItems(), getAliasMapCached(), isExplicitCheckoutBridge(), isExploratory() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (15): detectItemFamilyFromText(), escapeRegex(), hasDiscoverySignal(), hasRestaurantSelectionSignal(), hasSpicyPreferenceSignal(), includesWholePhrase(), isAliasBundleText(), isExplicitRestaurantSearch() (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.28
Nodes (19): closeConversation(), closeSession(), ensureSessionId(), generateNewSessionId(), getCache(), getOrCreateActiveSession(), getOrCreateActiveSessionAsync(), getSession() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (18): buildSuggestionReply(), calcItemsTotal(), createPendingOrderPayload(), formatItemsList(), generalMenuFallback(), handleCreateOrder(), handleLegacyOrderFlow(), handleParsedOrderFlow() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (13): expandRestaurantAliases(), extractCuisineType(), extractQuantity(), extractSize(), findBestDishMatch(), fuzzyIncludes(), fuzzyMatch(), levenshtein() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (7): BrainPipeline, buildMenuSummaryForTTSV2(), buildRestaurantSummaryForTTSV2(), isExplicitClearCartCommand(), isExplicitRestaurantNavigation(), mapOrderModeEvent(), resolveRecoContextPolicy()

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (15): cartMutationGuard(), confidenceFloorGuard(), confirmGuard(), continuityGuard(), escapeOverrideGuard(), expectedContextGuard(), floatingOrderCleanupGuard(), orderingAffirmationGuard() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (13): applySSMLStyling(), _emitStyleTrace(), formatTTSReply(), getGeminiModel(), getOpenAI(), getVertexClient(), normalizeForTTS(), normalizeGoogleVoice() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.26
Nodes (11): devError(), devLog(), devWarn(), getEngineMode(), isDev(), isStable(), isStrict(), sanitizeResponse() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.3
Nodes (10): cacheItems(), cacheRestaurants(), getCachedItems(), getCachedRestaurants(), getItemByName(), getRestaurantByName(), initEntityCache(), parsePosition() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (4): expandCuisineType(), findRestaurantsByLocation(), getLocationFallback(), withTimeout()

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (4): containsDishLikePhrase(), containsOrderingIntent(), looksLikeStreetAddress(), sanitizeLocation()

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (9): escapeSSML(), extractNamedEntities(), generatePhrase(), generatePhraseSync(), getOpenAIClient(), isLLMAvailable(), paraphraseWithLLM(), validateParaphrase() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.38
Nodes (9): buildSearchCorpus(), coerceEnumArray(), enrichRestaurant(), inferTaxonomyFromCorpus(), mapRestaurantToFeatures(), resolveDescription(), resolvePriceLevel(), resolveSupportsDelivery() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.24
Nodes (5): formatTurnsForContext(), getLastTurns(), initTurnBuffer(), pushAssistantTurn(), pushUserTurn()

### Community 19 - "Community 19"
Cohesion: 0.2
Nodes (2): InMemoryRestaurantRepository, SupabaseRestaurantRepository

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (7): buildRestaurantCorpus(), explainFilter(), rankRestaurantsByDiscovery(), runDiscovery(), scoreRestaurant(), shouldIncludeRestaurant(), tokenizeQuery()

### Community 21 - "Community 21"
Cohesion: 0.27
Nodes (4): getFirstChunk(), polishForSpeech(), processForTTS(), splitIntoChunks()

### Community 22 - "Community 22"
Cohesion: 0.53
Nodes (8): buildFallbackAliases(), inferItemFamily(), mapItemToMetadata(), normalizeLooseText(), pickNonEmptyString(), resolveBaseName(), toStringArray(), uniqueStrings()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (2): checkRequiredState(), checkSingleCondition()

### Community 24 - "Community 24"
Cohesion: 0.43
Nodes (6): detectDialogNav(), dialogNavGuard(), getCurrentDialogEntry(), goBackInDialog(), goForwardInDialog(), handleDialogNav()

### Community 25 - "Community 25"
Cohesion: 0.43
Nodes (7): extractCuisineType(), extractLocation(), extractQuantity(), isBlacklisted(), normalizePolishCity(), normalizeTxt(), stripDiacritics()

### Community 26 - "Community 26"
Cohesion: 0.54
Nodes (7): extractQuantity(), findDishInMenu(), fuzzyIncludes(), normalize(), normalizeDishText(), parseOrderItems(), parseRestaurantAndDish()

### Community 27 - "Community 27"
Cohesion: 0.48
Nodes (5): buildMenuPreview(), cacheKey(), getMenuItems(), invalidateMenuCache(), loadMenuPreview()

### Community 28 - "Community 28"
Cohesion: 0.62
Nodes (6): findDishInMenu(), fuzzyMatch(), levenshtein(), normalize(), parseOrderItems(), parseRestaurantAndDish()

### Community 29 - "Community 29"
Cohesion: 0.38
Nodes (3): applyPolicyTransformations(), finalizeResponse(), logResponseDecision()

### Community 30 - "Community 30"
Cohesion: 0.43
Nodes (4): exampleHandlerWithPolicy(), getResponsePolicyConfigFromDevPanel(), getUserABGroup(), simpleHash()

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.47
Nodes (3): adaptPolicyToSession(), applyAdminOverrides(), resolveResponsePolicy()

### Community 33 - "Community 33"
Cohesion: 0.6
Nodes (5): buildCheckoutProgress(), extractCheckoutDraft(), mergeCheckoutDraft(), normalizeCheckoutDraft(), toCleanString()

### Community 34 - "Community 34"
Cohesion: 0.6
Nodes (4): buildNaturalMenuReplySummary(), isLikelyDrink(), MenuHandler, normalizeMenuToken()

### Community 35 - "Community 35"
Cohesion: 0.6
Nodes (5): levenshtein(), normalizeExclusions(), normalizeExtras(), normalizeSize(), safeNormalize()

### Community 36 - "Community 36"
Cohesion: 0.53
Nodes (4): detectUserPreferences(), generateRecommendationSpeech(), getRestaurantRecommendations(), getSmartSuggestions()

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (4): detectQuantityConfidence(), finalizeEntities(), hasQuantityToken(), normalize()

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (1): HandlerDispatcher

### Community 40 - "Community 40"
Cohesion: 0.8
Nodes (4): canTransitionOrderMode(), resolveTransition(), sanitizeState(), transitionOrderMode()

### Community 41 - "Community 41"
Cohesion: 0.4
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 0.7
Nodes (4): buildCorpus(), inferFromCorpus(), main(), resolvePriceLevel()

### Community 43 - "Community 43"
Cohesion: 0.7
Nodes (4): buildClarifyMessage(), buildClarifyOrderMessage(), normalizeCategory(), resolveRequestedCategory()

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (2): validateCartBeforeCheckout(), validateItemBeforeAdd()

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 0.5
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (2): applyMultiItemParsing(), normalizeExistingItems()

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (2): assert(), assertGt()

### Community 49 - "Community 49"
Cohesion: 0.83
Nodes (3): main(), matchItemFamily(), normalize()

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (1): DomainDispatcher

### Community 51 - "Community 51"
Cohesion: 0.67
Nodes (1): SelectRestaurantHandler

### Community 52 - "Community 52"
Cohesion: 0.83
Nodes (3): refineIntentLLM(), refineWithGemini(), refineWithOpenAI()

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (2): matchDishPhonetic(), normalizePhonetic()

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (2): generateCartHash(), persistOrderToDB()

### Community 55 - "Community 55"
Cohesion: 0.83
Nodes (3): commitPendingOrder(), ensureSessionCart(), sum()

### Community 56 - "Community 56"
Cohesion: 0.5
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (2): commitPendingOrder(), ensureSessionCart()

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (2): callOpenAI(), llmDetectIntent()

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (1): MenuHydrationService

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (1): ResponseBuilder

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (1): SessionHydrator

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (1): ConfirmAddToCartHandler

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (1): ConfirmOrderHandler

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (1): OptionHandler

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (2): findRestaurantsByLocation(), makeKey()

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (2): canonicalizeDish(), normalizeScoped()

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (2): resolveRestaurantSelectionHybrid(), superNormalize()

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (2): formatDistance(), pluralPl()

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (0): 

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (0): 

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (0): 

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 77`** (2 nodes): `amber.js`, `handler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `brainV2.js`, `handler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (2 nodes): `stats.js`, `handler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (2 nodes): `supabaseClient.js`, `testSupabaseConnection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (2 nodes): `llmClient.js`, `callLLM()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (2 nodes): `llmReasoner.js`, `llmReasoner()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (2 nodes): `llmResponse.js`, `llmGenerateReply()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (2 nodes): `smartIntent.js`, `smartResolveIntent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (2 nodes): `shadowLogger.js`, `logShadowComparison()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (2 nodes): `GuardChain.js`, `runGuardChain()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (2 nodes): `restaurantCatalog.js`, `findRestaurantInText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (2 nodes): `confirmOrderHandler.js`, `handleConfirmOrder()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (2 nodes): `findNearbyHandler.js`, `handleFindNearby()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (2 nodes): `menuRequestHandler.js`, `handleMenuRequest()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (2 nodes): `boostIntent.js`, `boostIntent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (2 nodes): `fallbackIntent.js`, `fallbackIntent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (2 nodes): `intentRouterGlue.js`, `resolveIntent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (2 nodes): `orderValidator.js`, `validateOrderItem()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (2 nodes): `geoUtils.js`, `calculateDistance()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (2 nodes): `restaurantSearch.js`, `findRestaurant()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `DisambiguationService.js`, `resolveMenuItemConflict()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (2 nodes): `googleAuth.js`, `getVertexAccessToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (2 nodes): `intentLogger.js`, `logIssue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (2 nodes): `normalizeText.js`, `normalize()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (2 nodes): `testClient.js`, `testClient()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (2 nodes): `textMatch.js`, `scoreRestaurantMatch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `IntentGroups.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `taxonomy.runtime.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `cartUtils.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `orderEngine.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `recoTelemetry.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `EventLogger.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `logging.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._