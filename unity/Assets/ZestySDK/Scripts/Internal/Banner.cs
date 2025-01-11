using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Zesty
{
    public class Ad {
        public string asset_url;
        public string cta_url;
    }
    public class BannerInfo {
        public List<Ad> Ads;
        public string CampaignId;
    }

    [ExecuteInEditMode]
    public class Banner : MonoBehaviour {
        // Zesty Banner variables
        [Header("Banner Configuration")]
        public string adUnit;
        public string hostURL;
        public Formats.Types format;
        public bool beaconEnabled = true;

        public Material[] placeholderMaterials = new Material[3];
        public Material runtimeBanner;

        // DSIG variables
        [Header("DSIG Beacon Configuration")]
        public string specifiedName;
        [TextArea]
        public string specifiedDescription;
        public string specifiedUrl;
        public string specifiedImage;
        public List<string> specifiedTags;

        // Object-related variables
        MeshRenderer m_Renderer;
        Texture m_Texture;
        private MeshCollider m_Collider;

        // Banner info
        string url = Constants.ZESTY_URL;
        [DllImport("__Internal")] private static extern void _sendOnLoadMetric(string adUnitId, string campaignId);
        [DllImport("__Internal")] private static extern void _sendOnClickMetric(string adUnitId, string campaignId);
        [DllImport("__Internal")] private static extern void _open(string url);
        [DllImport("__Internal")] private static extern void _initPrebid(string adUnitId, int format);
        [DllImport("__Internal")] private static extern string _tryGetWinningBidInfo();
        string bannerTextureURL;
        string campaignId = "";

        // Banner loading variables
        bool bannerLoadedSuccessfully = false;

        // DSIG
        [DllImport("__Internal")] private static extern void _beaconSignal(string specifiedName, string specifiedDescription, string specifiedUrl, string specifiedImage, string specifiedTags);

        void Start() {
            m_Renderer = GetComponent<MeshRenderer>();
            m_Collider = GetComponent<MeshCollider>();
            if (Constants.PREBID)
            {
#if !UNITY_EDITOR
                _initPrebid(adUnit, (int)format);
                StartCoroutine(TryGetWinningBidInfo());
#endif
            }
            else
            {
                FetchCampaignAd();
            }

            string tags = string.Join(",", this.specifiedTags.ToArray());
            _beaconSignal(specifiedName, specifiedDescription, specifiedUrl, specifiedImage, tags);
        }

        /// <summary>
        /// Fetches the active campaign ad, if one exists, from the ad server
        /// </summary>
        void FetchCampaignAd() {
            string url = $"{Constants.AD_SERVER_URL}/ad?ad_unit_id={adUnit}&url={hostURL}";
            string[] elmsKey = { "Ads", "CampaignId" };
            StartCoroutine(API.GetRequest(url, elmsKey, SetBannerInfo));
        }

        void Update () {
            if (UnityEngine.Input.GetMouseButtonDown(0))
            {
                Ray ray = Camera.main.ScreenPointToRay(UnityEngine.Input.mousePosition);
                RaycastHit hit;
                if (m_Collider.Raycast(ray, out hit, 100))
                {
                    onClick();
                }
            }

            // Editor resizing
            if (transform.hasChanged && !Application.isPlaying)
            {
                UpdateBanner();
            }
        }

        /// <summary>
        /// Sets the active banner's texture and URL on the banner.
        /// Uses default values based on format if no banner info is present.
        /// </summary>
        /// <param name="bannerInfo">The Dictionary containing the active banner information.</param>
        public void SetBannerInfo(BannerInfo bannerInfo)
        {
            if (bannerInfo.CampaignId == "")
            {
                switch (format)
                {
                    case Formats.Types.MobilePhoneInterstitial:
                        StartCoroutine(API.GetTexture(Formats.MobilePhoneInterstitial.Images[0], SetTexture));
                        break;
                    case Formats.Types.Billboard:
                        StartCoroutine(API.GetTexture(Formats.Billboard.Images[0], SetTexture));
                        break;
                    case Formats.Types.MediumRectangle:
                    default:
                        StartCoroutine(API.GetTexture(Formats.MediumRectangle.Images[0], SetTexture));
                        break;
                }
                SetURL($"https://www.zesty.market/");
            }
            else if (bannerInfo.Ads.Count > 0)
            {
                bannerTextureURL = bannerInfo.Ads[0].asset_url;
                StartCoroutine(API.GetTexture(bannerTextureURL, SetTexture));
                SetURL(bannerInfo.Ads[0].cta_url);
                campaignId = bannerInfo.CampaignId;
            }
            else
            {
                Debug.Log("Couldn't set banner info");
            }

            if (beaconEnabled)
            {
#if UNITY_EDITOR
#else
                // Fire increment mutation to v2 beacon
                _sendOnLoadMetric(adUnit, campaignId);
#endif
            }
        }

        /// <summary>
        /// Sets the texture on the banner.
        /// </summary>
        /// <param name="texture">The texture to set the banner to.</param>
        public void SetTexture(Texture texture) {
            if (texture != null) {
                Material bannerMaterial = new Material(runtimeBanner);
                m_Renderer.sharedMaterial = bannerMaterial;
                bannerMaterial.mainTexture = texture;
                bannerLoadedSuccessfully = true;
            }
            else
            {
                Debug.Log("Failed to set texture");
            }
        }

        /// <summary>
        /// Sets the associated URL for the banner.
        /// Appends https:// if the given URL is bare.
        /// </summary>
        /// <param name="url">The URL to set on the banner.</param>
        public void SetURL(string url)
        {
            Regex urlMatch = new Regex(@"^http[s]?:\/\/");            
            url = urlMatch.Match(url).Success ? url : $"https://{url}";
            this.url = url;
        }

        public void onClick()
        {
            if (Application.platform == RuntimePlatform.WebGLPlayer)
                _open(url);
            else            
                Application.OpenURL(url);

            if (beaconEnabled)
            {
                // Fire increment mutation to v2 beacon
                _sendOnClickMetric(adUnit, campaignId);
            }
        }

        private void OnValidate()
        {
            UpdateBanner();
        }

        /// <summary>
        /// Scales the banner and sets its material based on the currently active format.
        /// </summary>
        private void UpdateBanner()
        {
            switch (format)
            {
                case Formats.Types.MobilePhoneInterstitial:
                    transform.localScale = new Vector3(transform.localScale.x, transform.localScale.x / (float)Formats.MobilePhoneInterstitial.Width, .001f);
                    gameObject.GetComponent<Renderer>().material = placeholderMaterials[0];
                    break;
                case Formats.Types.Billboard:
                    transform.localScale = new Vector3(transform.localScale.x, transform.localScale.x /(float)Formats.Billboard.Width, .001f);
                    gameObject.GetComponent<Renderer>().material = placeholderMaterials[1];
                    break;
                case Formats.Types.MediumRectangle:
                    transform.localScale = new Vector3(transform.localScale.x, transform.localScale.x / (float)Formats.MediumRectangle.Width, .001f);
                    gameObject.GetComponent<Renderer>().material = placeholderMaterials[2];
                    break;
            }
        }

        private IEnumerator TryGetWinningBidInfo()
        {
            if (m_Renderer.isVisible)
            {
                for (int i = 0; i < Constants.MAX_PREBID_RETRIES; i++)
                {
                    string adInfo = _tryGetWinningBidInfo();
                    if (adInfo == "")
                    {
                        yield return new WaitForSeconds(1);
                    }
                    else
                    {
                        string[] els = adInfo.Split('|');
                        BannerInfo bannerData = new()
                        {
                            Ads = new List<Ad>()
                        };
                        Ad ad = new()
                        {
                            asset_url = els[0],
                            cta_url = els[1]
                        };
                        bannerData.Ads.Add(ad);
                        bannerData.CampaignId = els[2];

                        SetBannerInfo(bannerData);

                        break;
                    }
                }
            }

            yield return new WaitForSeconds(Constants.PREBID_REFRESH_INTERVAL);
            StartCoroutine(TryGetWinningBidInfo());
        }
    }
}