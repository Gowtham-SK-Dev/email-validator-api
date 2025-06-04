API - > That shoud be in saperate repo.

Pages and their functionalities and tables
Home Page -> 
            -> Login 
                    -> Username
                    -> Password
            -> Registration
                        -> Username
                        -> Password
                        -> Mobile Number
                        -> Mail ID with OTP confirmation
            -> About Us  
                -> Company Information  
                    -> Company Name(Infosense Technologies)
                    -> Established Year (2025)
                    -> Location (India)
                -> Team Members 
                    -> Team Member Name (Gowtham)
                    -> Role (Founder & CEO)
                    -> Experience (5 years in software development)
                    -> Contact Information (gowtham3cse@gmail.com, +919787304714)
                -> Mission and Vision  
                    -> Mission Statement
                    -> Vision Statement
            -> Contact Us 
                -> Contact Form (Gowtham, gowtham3cse@gmail.com, +919787304714)
                -> Location Map (Google Maps link to Infosense Technologies office, bangalore) 
            -> Help 
                -> FAQ
                -> Support
            -> Privacy Policy 
                -> Data Collection
                -> Data Usage
                -> User Rights
            -> Terms and Conditions -> 
                -> User Agreement 
                -> Service Terms
            -> Subscription Plans -> 
                -> Plan Name
                -> Price
                -> Hit Limit
                -> Validity
                -> Suitable For

Login -> 
            -> Admin Login -> username, Password
            -> User Login -> username, Password
            -> Forgot Password -> username,  Mail ID with OTP
            -> Reset Password -> username, New Password, Confirm New Password
Registration -> 
            -> User Registration -> username, Password, Mobile Number, Mail ID with OTP confirmation, robot verification 
Admin Login->    
            -> Profile page
            -> Yearly Total Click Count,
            -> Monthly Total Click Count,
            -> Today's Click Count,
            -> User's Count
            -> Recently added Users (3 users with username and mobile number)
            -> User's List -> Search by username, mobile number, email
            -> User's Details -> User name 
                              -> password
                              -> Mobile Number
                              -> Mail id
                              -> API KEY -> non editable
                              -> API SECRET -> non editable
                              -> change password
            -> Click Count History (Daily, Monthly, Yearly) with Export to CSV
            -> Admin can reply to User's Help Message through admin panel
            -> Help Page -> reply Message 

User Login -> 

            -> Yearly click Count
            -> Monthly Click Count
            -> Today Click Count
            -> Profile page -> Username,
                            -> Password,
                            -> Mobile Number,
            -> API KEY -> non editable
            -> API SECRET -> non editable
            -> Subscriptions Page -> 
                -> Subscription Type (Free Trial, Starter, Basic, Standard, Pro, Unlimited (1M), Unlimited (3M), Unlimited (6M), Unlimited (1Y))
                -> Price
                -> Hit Limit
                -> Validity
                -> Suitable For
            -> Change Password with OTP
            -> Click Count History (Daily, Monthly, Yearly) with Export to CSV
            -> Help Page -> Message
            


Tables and columns

        Users -> id,
              -> username,
              -> password,
              -> mobile_number,
              -> email,
              -> api_key, 
              -> api_secret, 
              -> otp, 
              -> balance_clieck_count, 
              -> is_active,
              -> role_id, (forign key to Roles table)
              -> created_at, 
              -> updated_at
        Roles -> id, 
              -> role_name, 
              -> menu, 
              -> created_at, 
              -> updated_at
        menus -> id, 
              -> menu_name, 
              -> created_at, 
              -> updated_at

        Warrenties -> id, 
              -> user_id, (forign key to Users table)
              -> initial_click_count,
              -> current_click_count,
              -> used_click_count,
              -> is_active,
              -> created_at, 
              -> updated_at

        payments -> id, 
              -> user_id, (forign key to Users table)
              -> amount,
              -> payment_type_id, (forign key to Payment_Types table)
              -> subscription_id, (forign key to Subscriptions table)
              -> transaction_id,
              -> status,
              -> created_at, 
              -> updated_at

        payment_types -> id, 
              -> payment_type_name, (razorpay, paypal, stripe)
              -> api_key,
              -> api_secret,
              -> is_active,
              -> created_at, 
              -> updated_at
        
        subscriptions -> id, 
                -> user_id, 
                -> payment_type_id, 
                -> subscription_type_id, 
                -> transaction_id, 
                -> amount, 
                -> start_date, 
                -> end_date, 
                -> status, 
                -> created_at, 
                -> updated_at 
        
        subscription_types -> id, 
                -> plan_name, (monthly, yearly)
                -> price,  
                -> hit_limit,
                -> validity,
                -> is_active, 
                -> created_at, 
                -> updated_at 
| Plan Name          | Price (₹) | Hit Limit  | Validity | Suitable For                  |
| ------------------ | --------- | ---------- | -------- | ----------------------------- |
| **Free Trial**     | ₹0        | 100 hits   | 7 days   | Testing & Evaluation          |
| **Starter**        | ₹50       | 300 hits   | One-time | Small testing projects        |
| **Basic**          | ₹100      | 650 hits   | One-time | Developers / Freelancers      |
| **Standard**       | ₹200      | 1,400 hits | One-time | Small startups                |
| **Pro**            | ₹500      | 3,500 hits | One-time | Active businesses / APIs      |
| **Unlimited (1M)** | ₹1,000    | Unlimited  | 1 Month  | API-heavy startups            |
| **Unlimited (3M)** | ₹2,500    | Unlimited  | 3 Months | Agencies / Regular use cases  |
| **Unlimited (6M)** | ₹4,500    | Unlimited  | 6 Months | SaaS / Medium-scale companies |
| **Unlimited (1Y)** | ₹7,000    | Unlimited  | 1 Year   | Enterprises / Long-term users |

        Click_History -> id,
                -> user_id,
                -> initial_click_count,
                -> current_click_count,
                -> used_click_count,
                -> created_at,
                -> updated_at

        Help -> id,
                -> user_id,
                -> message,
                -> created_at,
                -> updated_at

        
