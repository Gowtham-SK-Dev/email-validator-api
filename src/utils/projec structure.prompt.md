API - > That shoud be in saperate repo.

Login -> 
            -> Admin Login -> username, Password
            -> User Login -> username, Password
            -> Forgot Password -> username,  Mail ID with OTP
Registration -> 
            -> User Registration -> username, Password, Mobile Number, Mail ID with OTP

Admin Login->    
            -> Profile page
            -> Yearly Total Click Count,
            -> Monthly Total Click Count,
            -> Daily Total Click Count,
            -> User Count
            -> Recently added Users (3)
            -> User List(all) -> User Details -> User name 
                                              -> password
                                              -> Mobile Number
                                              -> Mail id
                                              -> API KEY -> editable
                                              -> API SECRET -> editable
                                              -> change password

User Login -> 

            -> Yearly click Count
            -> Monthly Click Count
            -> Daily Clieck Count
            -> Profile page -> Username,
                            -> Password,
                            -> Mobile Number,
            -> API KEY -> non editable
            -> API SECRET -> non editable
            -> Change Password with OTP
            -> Click Count History (Daily, Monthly, Yearly) with Export to CSV
            -> Help Page -> Message with Mail
            


Tables 

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
              -> role_id,
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
              -> user_id, 
              -> initial_click_count,
              -> current_click_count,
              -> used_click_count,
              -> is_active,
              -> created_at, 
              -> updated_at

        payments -> id, 
              -> user_id, 
              -> amount,
              -> payment_type_id, 
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
                -> subscription_type_name, (monthly, yearly)[
                                                            (RS,	HitCounts),
                                                            (50,    300),
                                                            (100,   650),	
                                                            (200,	1400),	
                                                            (500,	3500),	
                                                            (1000, one month unlimited)
                                                            (2000, three month unlimited)
                                                            (5000, six month unlimited)
                                                            (10000, one year unlimited)
                                                            ]
                -> duration,
                -> is_active,
                -> created_at, 
                -> updated_at

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

        
